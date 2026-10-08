(() => {
  const form = document.getElementById("riskForm");
  const submitBtn = document.getElementById("submitBtn");
  const errorNote = document.getElementById("errorNote");
  const verdict = document.getElementById("verdict");
  

  // SHAP explanation elements
  const explanation = document.getElementById("explanation");
  const riskFactors = document.getElementById("riskFactors");
  const protectiveFactors = document.getElementById("protectiveFactors");

  const incomeInput = document.getElementById("person_income");
  const amountInput = document.getElementById("loan_amnt");
  const percentInput = document.getElementById("loan_percent_income");

  const gaugeFill = document.getElementById("gaugeFill");
  const gaugeThreshold = document.getElementById("gaugeThreshold");
  const probNumber = document.getElementById("probNumber");
  const stampBadge = document.getElementById("stampBadge");
  const stampText = document.getElementById("stampText");

  const factProb = document.getElementById("factProb");
  const factThreshold = document.getElementById("factThreshold");
  const factResult = document.getElementById("factResult");

  const apiDot = document.getElementById("apiDot");
  const apiStatusText = document.getElementById("apiStatusText");

  const GAUGE_CIRCUMFERENCE = 540.35;


  // =========================================================
  // Loan-to-income ratio
  // =========================================================

  function recalcPercent() {
    const income = parseFloat(incomeInput.value);
    const amount = parseFloat(amountInput.value);

    if (income > 0 && amount >= 0) {
      percentInput.value = (amount / income).toFixed(2);
    }
  }

  incomeInput.addEventListener("input", recalcPercent);
  amountInput.addEventListener("input", recalcPercent);

  recalcPercent();


  // =========================================================
  // API status
  // =========================================================

  fetch("/openapi.json", { method: "GET" })
    .then((res) => {
      if (res.ok) {
        apiDot.classList.add("ok");
        apiStatusText.textContent = "service ready";
      } else {
        throw new Error("bad status");
      }
    })
    .catch(() => {
      apiDot.classList.add("down");
      apiStatusText.textContent = "service unreachable";
    });


  // =========================================================
  // Loading state
  // =========================================================

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;

    submitBtn.classList.toggle(
      "loading",
      isLoading
    );

    submitBtn.querySelector(".btn-label").textContent =
      isLoading
        ? "Reviewing file…"
        : "Assess risk";
  }


  // =========================================================
  // Error handling
  // =========================================================

  function showError(message) {
    errorNote.textContent = message;
    errorNote.hidden = false;
  }

  function clearError() {
    errorNote.hidden = true;
    errorNote.textContent = "";
  }


  // =========================================================
  // Probability animation
  // =========================================================

  function animateNumber(el, from, to, duration) {
    const start = performance.now();

    function tick(now) {
      const t = Math.min(
        1,
        (now - start) / duration
      );

      const eased = 1 - Math.pow(1 - t, 3);

      const value =
        from + (to - from) * eased;

      el.textContent = value.toFixed(1);

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = to.toFixed(1);
      }
    }

    requestAnimationFrame(tick);
  }


  // =========================================================
  // SHAP factor creation
  // =========================================================

  function createFactorElement(factor) {

    const item = document.createElement("div");
    item.className = "factor-item";


    // -----------------------------------------
    // Feature name + value
    // -----------------------------------------

    const top = document.createElement("div");
    top.className = "factor-top";

    const name = document.createElement("span");
    name.className = "factor-name";
    name.textContent = factor.feature;

    const value = document.createElement("span");
    value.className = "factor-value";

    /*
     * Add friendly formatting for some values.
     */
    if (factor.feature === "Annual income") {
      const numericValue = Number(factor.value);

      if (!Number.isNaN(numericValue)) {
        value.textContent =
          "₹" +
          numericValue.toLocaleString("en-IN");
      } else {
        value.textContent = factor.value;
      }

    } else {
      value.textContent = factor.value;
    }


    top.appendChild(name);
    top.appendChild(value);


    // -----------------------------------------
    // SHAP importance bar
    // -----------------------------------------

    const bar = document.createElement("div");
    bar.className = "factor-bar";

    const fill = document.createElement("div");
    fill.className = "factor-bar-fill";


    /*
     * This is ONLY a visual representation
     * of SHAP magnitude.
     *
     * It is NOT a probability percentage.
     */
    const magnitude =
      Math.min(
        Math.abs(Number(factor.impact)) * 50,
        100
      );

    fill.style.width = `${magnitude}%`;

    bar.appendChild(fill);


    item.appendChild(top);
    item.appendChild(bar);

    return item;
  }


  // =========================================================
  // Render SHAP explanation
  // =========================================================

 function renderShapFactors(data) {

  console.log("========== SHAP DEBUG ==========");
  console.log("API data:", data);
  console.log("Explanation element:", explanation);
  console.log("Risk factors element:", riskFactors);
  console.log("Protective factors element:", protectiveFactors);

  // Show the section FIRST
  if (explanation) {
    explanation.removeAttribute("hidden");
    explanation.style.display = "block";
  } else {
    console.error("ERROR: #explanation was not found!");
    return;
  }

  // Check the factor containers
  if (!riskFactors) {
    console.error("ERROR: #riskFactors was not found!");
    return;
  }

  if (!protectiveFactors) {
    console.error("ERROR: #protectiveFactors was not found!");
    return;
  }

  // Clear previous results
  riskFactors.innerHTML = "";
  protectiveFactors.innerHTML = "";

  const risk = data?.risk_factors || [];
  const protective = data?.protective_factors || [];

  console.log("Risk factors:", risk);
  console.log("Protective factors:", protective);


  // --------------------------------------------------
  // Risk factors
  // --------------------------------------------------

  risk.forEach((factor) => {

    riskFactors.appendChild(
      createFactorElement(factor)
    );

  });


  // --------------------------------------------------
  // Protective factors
  // --------------------------------------------------

  protective.forEach((factor) => {

    protectiveFactors.appendChild(
      createFactorElement(factor)
    );

  });


  // --------------------------------------------------
  // Empty states
  // --------------------------------------------------

  if (risk.length === 0) {

    riskFactors.innerHTML =
      `<p class="empty-factor">
        No significant risk-increasing factors.
      </p>`;

  }


  if (protective.length === 0) {

    protectiveFactors.innerHTML =
      `<p class="empty-factor">
        No significant protective factors.
      </p>`;

  }

  console.log("SHAP SECTION DISPLAYED");
  console.log("================================");
}


  // =========================================================
  // Render verdict
  // =========================================================

  function renderVerdict(data) {

    const probabilityPct =
      data.default_probability * 100;

    const thresholdPct =
      data.threshold * 100;

    const isHighRisk =
      data.default_prediction === 1;


    verdict.hidden = false;

    verdict.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });


    // -----------------------------------------
    // Gauge
    // -----------------------------------------

    const offset =
      GAUGE_CIRCUMFERENCE *
      (1 - probabilityPct / 100);

    gaugeFill.style.stroke =
      isHighRisk
        ? "var(--risk-red)"
        : "var(--brass)";

    requestAnimationFrame(() => {

      gaugeFill.style.strokeDashoffset =
        offset;

    });


    // Threshold marker
    gaugeThreshold.style.transform =
      `rotate(${thresholdPct * 3.6}deg)`;


    // Probability animation
    animateNumber(
      probNumber,
      0,
      probabilityPct,
      1000
    );


    // -----------------------------------------
    // Risk stamp
    // -----------------------------------------

    stampBadge.classList.remove(
      "stamp--in",
      "risk-high"
    );

    void stampBadge.offsetWidth;


    if (isHighRisk) {

      stampBadge.classList.add(
        "risk-high"
      );

      stampText.textContent =
        "HIGH RISK";

    } else {

      stampText.textContent =
        "LOW RISK";

    }


    requestAnimationFrame(() =>
      stampBadge.classList.add("stamp--in")
    );


    // -----------------------------------------
    // Facts
    // -----------------------------------------

    factProb.textContent =
      `${probabilityPct.toFixed(1)}%`;

    factThreshold.textContent =
      `${thresholdPct.toFixed(1)}%`;

    factResult.textContent =
      data.Result;


    // -----------------------------------------
    // SHAP explanation
    // -----------------------------------------

    renderShapFactors(data);
  }


  // =========================================================
  // Form submission
  // =========================================================

  form.addEventListener(
    "submit",
    async (e) => {

      e.preventDefault();

      clearError();

      setLoading(true);


      const payload = {

        person_age:
          parseInt(
            document.getElementById(
              "person_age"
            ).value,
            10
          ),

        person_income:
          parseFloat(
            incomeInput.value
          ),

        person_home_ownership:
          document.getElementById(
            "person_home_ownership"
          ).value,

        person_emp_length:
          parseFloat(
            document.getElementById(
              "person_emp_length"
            ).value
          ),

        loan_intent:
          document.getElementById(
            "loan_intent"
          ).value,

        loan_grade:
          document.getElementById(
            "loan_grade"
          ).value,

        loan_amnt:
          parseFloat(
            amountInput.value
          ),

        loan_int_rate:
          parseFloat(
            document.getElementById(
              "loan_int_rate"
            ).value
          ),

        loan_percent_income:
          parseFloat(
            percentInput.value
          ),

        cb_person_default_on_file:
          document.getElementById(
            "cb_person_default_on_file"
          ).value,

        cb_person_cred_hist_length:
          parseInt(
            document.getElementById(
              "cb_person_cred_hist_length"
            ).value,
            10
          )
      };


      try {

        const res =
          await fetch(
            "/predict",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify(payload)
            }
          );


        if (!res.ok) {

          const body =
            await res
              .json()
              .catch(() => null);

          const detail =
            body && body.detail
              ? JSON.stringify(body.detail)
              : `HTTP ${res.status}`;

          throw new Error(detail);
        }


        const data =
          await res.json();


        // Render prediction + SHAP
        renderVerdict(data);

      } catch (err) {

        showError(
          `Could not reach the ledger. ${
            err.message ||
            "Check the service is running."
          }`
        );

      } finally {

        setLoading(false);

      }

    }
  );

})();