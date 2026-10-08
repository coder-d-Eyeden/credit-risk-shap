from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import joblib
import shap

from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles


ml_model = {}


@asynccontextmanager
async def lifespan(app: FastAPI):

    # Calibrated model used for final probability prediction
    ml_model["model"] = joblib.load("credit_risk_model.pkl")

    # Optimized classification threshold
    ml_model["threshold"] = joblib.load("best_threshold.pkl")

    # Underlying tuned XGBoost pipeline used for SHAP
    ml_model["shap_model"] = joblib.load("xgb_base_model.pkl")

    # Extract preprocessing and XGBoost classifier
    shap_pipeline = ml_model["shap_model"]

    ml_model["preprocessor"] = shap_pipeline.named_steps["preprocessor"]
    ml_model["xgb"] = shap_pipeline.named_steps["classifier"]

    # SHAP explainer for the underlying XGBoost model
    ml_model["explainer"] = shap.TreeExplainer(
        ml_model["xgb"]
    )

    yield

    ml_model.clear()


app = FastAPI(lifespan=lifespan)


# --------------------------------------------------
# Input schema
# --------------------------------------------------

class LoanApplication(BaseModel):
    person_age: int
    person_income: float
    person_home_ownership: str
    person_emp_length: float
    loan_intent: str
    loan_grade: str
    loan_amnt: float
    loan_int_rate: float
    loan_percent_income: float
    cb_person_default_on_file: str
    cb_person_cred_hist_length: int


# --------------------------------------------------
# SHAP helper
# --------------------------------------------------

FEATURE_LABELS = {
    "person_age": "Age",
    "person_income": "Annual income",
    "person_home_ownership": "Home ownership",
    "person_emp_length": "Employment length",
    "loan_intent": "Loan purpose",
    "loan_grade": "Loan grade",
    "loan_amnt": "Loan amount",
    "loan_int_rate": "Interest rate",
    "loan_percent_income": "Loan-to-income ratio",
    "cb_person_default_on_file": "Previous default",
    "cb_person_cred_hist_length": "Credit history length",
}


def get_shap_factors(input_df):
    """
    Generate SHAP explanations for one loan application.

    SHAP explains the underlying XGBoost risk score.
    It does NOT explain the calibration layer directly.
    """

    preprocessor = ml_model["preprocessor"]
    explainer = ml_model["explainer"]

    # Transform input exactly as the XGBoost model expects
    transformed = preprocessor.transform(input_df)

    # Calculate SHAP values
    shap_values = explainer.shap_values(transformed)

    # Handle possible SHAP output formats
    if isinstance(shap_values, list):
        shap_values = shap_values[-1]

    shap_values = shap_values[0]

    # Get transformed feature names
    feature_names = preprocessor.get_feature_names_out()

    # --------------------------------------------------
    # Aggregate one-hot encoded features
    # --------------------------------------------------

    aggregated = {}

    for feature_name, shap_value in zip(feature_names, shap_values):

        # Example:
        # cat__person_home_ownership_RENT
        # num__person_income

        original_name = feature_name.split("__", 1)[-1]

        # Identify the original feature
        matched_feature = None

        for column in input_df.columns:
            if (
                original_name == column
                or original_name.startswith(column + "_")
            ):
                matched_feature = column
                break

        if matched_feature is None:
            matched_feature = original_name

        if matched_feature not in aggregated:
            aggregated[matched_feature] = 0.0

        aggregated[matched_feature] += float(shap_value)

    # --------------------------------------------------
    # Create readable SHAP factors
    # --------------------------------------------------

    risk_factors = []
    protective_factors = []

    for feature, shap_value in aggregated.items():

        if feature not in input_df.columns:
            continue

        raw_value = input_df.iloc[0][feature]

        label = FEATURE_LABELS.get(feature, feature)

        factor = {
            "feature": label,
            "value": str(raw_value),
            "impact": round(shap_value, 4),
            "direction": (
                "increases_risk"
                if shap_value > 0
                else "reduces_risk"
            ),
        }

        if shap_value > 0:
            risk_factors.append(factor)

        elif shap_value < 0:
            protective_factors.append(factor)

    # Strongest factors first
    risk_factors.sort(
        key=lambda x: abs(x["impact"]),
        reverse=True
    )

    protective_factors.sort(
        key=lambda x: abs(x["impact"]),
        reverse=True
    )

    # Return only the most important factors
    return {
        "risk_factors": risk_factors[:3],
        "protective_factors": protective_factors[:3],
    }


# --------------------------------------------------
# Prediction endpoint
# --------------------------------------------------

@app.post("/predict")
def predict(data: LoanApplication):

    input_df = pd.DataFrame([data.dict()])

    # ----------------------------------------------
    # Final calibrated probability
    # ----------------------------------------------

    probability = ml_model["model"].predict_proba(
        input_df
    )[:, 1][0]

    # ----------------------------------------------
    # Apply optimized threshold
    # ----------------------------------------------

    prediction = int(
        probability >= ml_model["threshold"]
    )

    # ----------------------------------------------
    # SHAP explanation
    # ----------------------------------------------

    shap_factors = get_shap_factors(input_df)

    # ----------------------------------------------
    # API response
    # ----------------------------------------------

    return {
        "default_probability": float(probability),

        "default_prediction": prediction,

        "threshold": float(
            ml_model["threshold"]
        ),

        "Result": (
            "High Risk"
            if prediction == 1
            else "Low Risk"
        ),

        "risk_factors": shap_factors["risk_factors"],

        "protective_factors": shap_factors[
            "protective_factors"
        ],
    }


# --------------------------------------------------
# Static frontend
# --------------------------------------------------

app.mount(
    "/",
    StaticFiles(
        directory="static",
        html=True
    ),
    name="static"
)