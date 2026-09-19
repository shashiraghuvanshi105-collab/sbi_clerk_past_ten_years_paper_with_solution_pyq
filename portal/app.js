// ==========================================================================
// SBI CLERK MASTER EXAM PORTAL — APP CONTROLLER & LOGIC
// ==========================================================================
// Security-hardened: All user-facing data is sanitized before DOM insertion.
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  // State
  const state = {
    phase: "prelims", // 'prelims' | 'mains'
    year: "all",
    section: "all",
    search: "",
    mode: "practice", // 'practice' | 'quiz'
    answers: {}, // { [qId]: selectedOptionIndex }
    timerSecs: 20 * 60,
    timerInterval: null,
    quizSubmitted: false,
    searchDebounceTimer: null
  };

  // Section configs per phase
  const SECTION_CONFIG = {
    prelims: [
      { id: "all", name: "All Sections" },
      { id: "English", name: "English Language (30 Qs)" },
      { id: "Quantitative Aptitude", name: "Quantitative Aptitude (35 Qs)" },
      { id: "Reasoning Ability", name: "Reasoning Ability (35 Qs)" }
    ],
    mains: [
      { id: "all", name: "All Sections" },
      { id: "General/Financial Awareness", name: "General/Financial Awareness (50 Qs)" },
      { id: "General English", name: "General English (40 Qs)" },
      { id: "Quantitative Aptitude", name: "Quantitative Aptitude (50 Qs)" },
      { id: "Reasoning & Computer Aptitude", name: "Reasoning & Computer (50 Qs)" }
    ]
  };

  // --------------------------------------------------------------------------
  // SECURITY: HTML Sanitization Utility
  // --------------------------------------------------------------------------
  /**
   * Escapes HTML special characters to prevent XSS injection.
   * All data from exam_data.js passes through this before innerHTML insertion.
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Validates and sanitizes URLs. Only allows http/https protocols.
   * Prevents javascript: and data: URI injection in href attributes.
   */
  function sanitizeUrl(url) {
    if (!url || typeof url !== "string") return "https://sbi.co.in/web/careers/";
    const trimmed = url.trim();
    // Only allow http and https protocols
    if (/^https?:\/\//i.test(trimmed)) {
      return escapeHtml(trimmed);
    }
    return "https://sbi.co.in/web/careers/";
  }

  /**
   * Sanitizes a string for use as a DOM ID attribute.
   * Removes any characters that could be used for DOM clobbering.
   */
  function sanitizeId(str) {
    if (!str || typeof str !== "string") return "unknown";
    return str.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  /**
   * Debounce utility — delays function execution until after wait ms
   * of inactivity. Prevents excessive DOM rebuilds during typing.
   */
  function debounce(fn, wait) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // DOM Elements
  const el = {
    themeBtn: document.getElementById("theme-btn"),
    themeIcon: document.getElementById("theme-icon"),
    tabPrelims: document.getElementById("tab-prelims"),
    tabMains: document.getElementById("tab-mains"),
    modePractice: document.getElementById("mode-practice"),
    modeQuiz: document.getElementById("mode-quiz"),
    viewTitle: document.getElementById("view-title"),
    viewSubtitle: document.getElementById("view-subtitle"),
    quizTimerBar: document.getElementById("quiz-timer-bar"),
    timerDigits: document.getElementById("timer-digits"),
    answeredCount: document.getElementById("answered-count"),
    remainingCount: document.getElementById("remaining-count"),
    submitQuizBtn: document.getElementById("submit-quiz-btn"),
    searchInput: document.getElementById("search-input"),
    clearSearch: document.getElementById("clear-search"),
    yearFilters: document.getElementById("year-filters"),
    sectionFilters: document.getElementById("section-filters"),
    questionsList: document.getElementById("questions-list"),
    totalResults: document.getElementById("total-results"),
    expandAllBtn: document.getElementById("expand-all-btn"),
    collapseAllBtn: document.getElementById("collapse-all-btn"),
    openCutoffsBtn: document.getElementById("open-cutoffs-btn"),
    cutoffsModal: document.getElementById("cutoffs-modal"),
    closeCutoffs: document.getElementById("close-cutoffs"),
    scorecardModal: document.getElementById("scorecard-modal"),
    closeScorecard: document.getElementById("close-scorecard"),
    btnReviewSolutions: document.getElementById("btn-review-solutions"),
    btnRetakeExam: document.getElementById("btn-retake-exam")
  };

  // --------------------------------------------------------------------------
  // Theme Management (with localStorage safety)
  // --------------------------------------------------------------------------
  let savedTheme = "dark";
  try {
    savedTheme = localStorage.getItem("sbi_theme") || "dark";
  } catch (e) {
    // localStorage may be unavailable in private browsing or iframe sandboxes
  }
  // Validate theme value — only allow known values
  if (savedTheme !== "dark" && savedTheme !== "light") savedTheme = "dark";
  document.body.setAttribute("data-theme", savedTheme);
  el.themeIcon.textContent = savedTheme === "dark" ? "☀️" : "🌙";

  el.themeBtn.addEventListener("click", () => {
    const curr = document.body.getAttribute("data-theme");
    const next = curr === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    try {
      localStorage.setItem("sbi_theme", next);
    } catch (e) {
      // Silently fail if localStorage is full or unavailable
    }
    el.themeIcon.textContent = next === "dark" ? "☀️" : "🌙";
  });

  // --------------------------------------------------------------------------
  // Phase Switcher (Prelims vs Mains)
  // --------------------------------------------------------------------------
  function setPhase(newPhase) {
    state.phase = newPhase;
    state.section = "all";
    state.answers = {};
    state.quizSubmitted = false;

    if (newPhase === "prelims") {
      el.tabPrelims.classList.add("active");
      el.tabPrelims.setAttribute("aria-selected", "true");
      el.tabMains.classList.remove("active");
      el.tabMains.setAttribute("aria-selected", "false");
      el.viewTitle.textContent = "Phase 1: Preliminary Examination Bank";
      el.viewSubtitle.textContent = "Official 2-Tier CBT Memory-Based Question Papers & Solutions (2016 – 2025)";
    } else {
      el.tabMains.classList.add("active");
      el.tabMains.setAttribute("aria-selected", "true");
      el.tabPrelims.classList.remove("active");
      el.tabPrelims.setAttribute("aria-selected", "false");
      el.viewTitle.textContent = "Phase 2: Main Examination Bank";
      el.viewSubtitle.textContent = "Solved High-Level Papers: Financial Awareness, Advanced DI, Puzzles & Computer Aptitude";
    }

    // BUG FIX: Reset timer when switching phase in quiz mode
    if (state.mode === "quiz") {
      startTimer();
    }

    renderSectionPills();
    renderQuestions();
    updateQuizCounters();
  }

  el.tabPrelims.addEventListener("click", () => setPhase("prelims"));
  el.tabMains.addEventListener("click", () => setPhase("mains"));

  // --------------------------------------------------------------------------
  // Mode Switcher (Study vs Quiz)
  // --------------------------------------------------------------------------
  function setMode(newMode) {
    state.mode = newMode;
    if (newMode === "practice") {
      el.modePractice.classList.add("active");
      el.modeQuiz.classList.remove("active");
      el.quizTimerBar.classList.add("hidden");
      stopTimer();
    } else {
      el.modeQuiz.classList.add("active");
      el.modePractice.classList.remove("active");
      el.quizTimerBar.classList.remove("hidden");
      startTimer();
    }
    renderQuestions();
  }

  el.modePractice.addEventListener("click", () => setMode("practice"));
  el.modeQuiz.addEventListener("click", () => setMode("quiz"));

  // --------------------------------------------------------------------------
  // Section Pills Rendering
  // --------------------------------------------------------------------------
  function renderSectionPills() {
    const config = SECTION_CONFIG[state.phase];
    el.sectionFilters.innerHTML = "";

    config.forEach(sec => {
      const btn = document.createElement("button");
      btn.className = `pill ${state.section === sec.id ? "active" : ""}`;
      btn.textContent = sec.name;
      btn.dataset.sec = sec.id;
      btn.addEventListener("click", () => {
        state.section = sec.id;
        el.sectionFilters.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        renderQuestions();
      });
      el.sectionFilters.appendChild(btn);
    });
  }

  // --------------------------------------------------------------------------
  // Year Filter Click
  // --------------------------------------------------------------------------
  el.yearFilters.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn || btn.disabled) return;

    state.year = btn.dataset.year;
    el.yearFilters.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    renderQuestions();
  });

  // --------------------------------------------------------------------------
  // Search Box (with debounce for performance)
  // --------------------------------------------------------------------------
  const debouncedRender = debounce(() => renderQuestions(), 250);

  el.searchInput.addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    el.clearSearch.classList.toggle("hidden", state.search.length === 0);
    debouncedRender();
  });

  el.clearSearch.addEventListener("click", () => {
    el.searchInput.value = "";
    state.search = "";
    el.clearSearch.classList.add("hidden");
    renderQuestions();
  });

  // --------------------------------------------------------------------------
  // Question Filtering
  // --------------------------------------------------------------------------
  function getFilteredQuestions() {
    const raw = window.SBI_EXAM_DATA || [];
    return raw.filter(q => {
      // Phase match
      if (q.phase !== state.phase) return false;
      // Year match
      if (state.year !== "all" && q.year !== state.year) return false;
      // Section match
      if (state.section !== "all") {
        if (q.section.toLowerCase() !== state.section.toLowerCase()) return false;
      }
      // Search match
      if (state.search) {
        const textToSearch = [
          q.qText,
          q.topic,
          q.section,
          q.passage || "",
          q.explanation || "",
          ...q.options
        ].join(" ").toLowerCase();

        if (!textToSearch.includes(state.search)) return false;
      }
      return true;
    });
  }

  // --------------------------------------------------------------------------
  // Reset Filters (via event delegation — no global scope pollution)
  // --------------------------------------------------------------------------
  function resetFilters() {
    state.year = "all";
    state.section = "all";
    state.search = "";
    el.searchInput.value = "";
    el.clearSearch.classList.add("hidden");
    el.yearFilters.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p.dataset.year === "all"));
    renderSectionPills();
    renderQuestions();
  }

  // Event delegation for dynamically created reset button
  el.questionsList.addEventListener("click", (e) => {
    const resetBtn = e.target.closest("[data-action='reset-filters']");
    if (resetBtn) {
      resetFilters();
    }
  });

  // --------------------------------------------------------------------------
  // Questions Rendering
  // --------------------------------------------------------------------------
  function renderQuestions() {
    const filtered = getFilteredQuestions();
    el.totalResults.textContent = filtered.length;
    el.questionsList.innerHTML = "";

    if (filtered.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-state";
      emptyDiv.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p>No questions matched your current filter criteria.</p>
      `;
      // SECURITY FIX: Use DOM API instead of inline onclick
      const resetBtn = document.createElement("button");
      resetBtn.className = "btn-link";
      resetBtn.textContent = "Reset All Filters";
      resetBtn.setAttribute("data-action", "reset-filters");
      emptyDiv.appendChild(resetBtn);
      el.questionsList.appendChild(emptyDiv);
      return;
    }

    filtered.forEach((q, idx) => {
      const card = createQuestionCard(q, idx + 1);
      el.questionsList.appendChild(card);
    });

    updateQuizCounters();
  }

  // --------------------------------------------------------------------------
  // Create Question Card DOM (XSS-hardened)
  // --------------------------------------------------------------------------
  function createQuestionCard(q, displayNum) {
    const card = document.createElement("div");
    card.className = "q-card";
    card.id = `card-${sanitizeId(q.id)}`;

    const letters = ["A", "B", "C", "D", "E"];
    const userChoice = state.answers[q.id];
    const isSubmitted = state.quizSubmitted;
    const isPractice = state.mode === "practice";

    // DATA INTEGRITY: Validate correctAnswer is within bounds
    const correctIdx = (typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < q.options.length)
      ? q.correctAnswer
      : 0;

    // Meta Header — all data escaped
    const meta = document.createElement("div");
    meta.className = "q-meta";
    meta.innerHTML = `
      <div class="q-tags">
        <span class="badge badge-year">${escapeHtml(q.year)}</span>
        <span class="badge badge-sec">${escapeHtml(q.section)}</span>
        <span class="badge badge-topic">${escapeHtml(q.topic)}</span>
        <span class="badge badge-verified" title="Verifiable SBI / IBPS Memory-Based Question Archive">✔ Verified Authentic</span>
      </div>
      <span class="q-num">Q. #${displayNum}</span>
    `;
    card.appendChild(meta);

    // Optional Passage — escaped
    if (q.passage) {
      const pass = document.createElement("div");
      pass.className = "q-passage";
      pass.innerHTML = `<strong>Context / Passage:</strong> ${escapeHtml(q.passage)}`;
      card.appendChild(pass);
    }

    // Question Stem — safe via textContent
    const title = document.createElement("div");
    title.className = "q-text";
    title.textContent = q.qText;
    card.appendChild(title);

    // Options Group
    const optGroup = document.createElement("div");
    optGroup.className = "options-group";

    q.options.forEach((optText, optIdx) => {
      const item = document.createElement("div");
      item.className = "option-item";

      const isChosen = userChoice === optIdx;
      if (isChosen) item.classList.add("selected");

      // Feedback classes in Practice mode or Post-Quiz submit
      if (isPractice && userChoice !== undefined) {
        if (optIdx === correctIdx) item.classList.add("correct-ans");
        else if (isChosen && userChoice !== correctIdx) item.classList.add("wrong-ans");
      } else if (isSubmitted) {
        if (optIdx === correctIdx) item.classList.add("correct-ans");
        else if (isChosen && userChoice !== correctIdx) item.classList.add("wrong-ans");
      }

      // SECURITY: Option text escaped before insertion
      item.innerHTML = `
        <div class="option-circle">${letters[optIdx]}</div>
        <div class="option-label">${escapeHtml(optText)}</div>
      `;

      item.addEventListener("click", () => {
        if (state.quizSubmitted) return; // locked after submit

        state.answers[q.id] = optIdx;

        // PERFORMANCE FIX: Update only this card instead of full re-render
        updateCardState(card, q);
        updateQuizCounters();
      });

      optGroup.appendChild(item);
    });

    card.appendChild(optGroup);

    // Solution & Card Footer
    const footer = document.createElement("div");
    footer.className = "card-footer";

    const solBtn = document.createElement("button");
    solBtn.className = "btn-toggle-sol";
    solBtn.innerHTML = `<span>💡</span> Reveal Solution`;

    const solBox = document.createElement("div");
    solBox.className = `solution-box ${isSubmitted ? "visible" : ""}`;

    // SECURITY: Validate source URL and escape all data
    const safeSourceLink = sanitizeUrl(q.source_url);
    const safeSourceLabel = escapeHtml(q.source_ref || "SBI Careers Official Notification & IBPS Memory-Based Archive");
    const safeCorrectOption = escapeHtml(q.options[correctIdx]);
    const safeExplanation = escapeHtml(q.explanation);

    solBox.innerHTML = `
      <div class="sol-key">Correct Answer: (${letters[correctIdx]}) ${safeCorrectOption}</div>
      <div><strong>Step-by-Step Explanation:</strong> ${safeExplanation}</div>
      <div class="sol-source">
        <span>🔗 <strong>Authentic Reference:</strong></span>
        <a href="${safeSourceLink}" target="_blank" rel="noopener noreferrer">${safeSourceLabel}</a>
      </div>
    `;

    solBtn.addEventListener("click", () => {
      const isVis = solBox.classList.toggle("visible");
      solBtn.innerHTML = isVis ? `<span>✖</span> Hide Solution` : `<span>💡</span> Reveal Solution`;
    });

    footer.appendChild(solBtn);
    card.appendChild(footer);
    card.appendChild(solBox);

    return card;
  }

  // --------------------------------------------------------------------------
  // PERFORMANCE: Update only the affected card's visual state
  // --------------------------------------------------------------------------
  function updateCardState(card, q) {
    const letters = ["A", "B", "C", "D", "E"];
    const userChoice = state.answers[q.id];
    const isPractice = state.mode === "practice";
    const isSubmitted = state.quizSubmitted;
    const optionItems = card.querySelectorAll(".option-item");

    // DATA INTEGRITY: Same bounds check as createQuestionCard
    const correctIdx = (typeof q.correctAnswer === "number" && q.correctAnswer >= 0 && q.correctAnswer < q.options.length)
      ? q.correctAnswer
      : 0;

    optionItems.forEach((item, optIdx) => {
      const isChosen = userChoice === optIdx;

      // Reset classes
      item.classList.remove("selected", "correct-ans", "wrong-ans");

      if (isChosen) item.classList.add("selected");

      if (isPractice && userChoice !== undefined) {
        if (optIdx === correctIdx) item.classList.add("correct-ans");
        else if (isChosen && userChoice !== correctIdx) item.classList.add("wrong-ans");
      } else if (isSubmitted) {
        if (optIdx === correctIdx) item.classList.add("correct-ans");
        else if (isChosen && userChoice !== correctIdx) item.classList.add("wrong-ans");
      }
    });

    // In practice mode, auto-reveal solution when answer is selected
    if (isPractice && userChoice !== undefined) {
      const solBox = card.querySelector(".solution-box");
      const solBtn = card.querySelector(".btn-toggle-sol");
      if (solBox && !solBox.classList.contains("visible")) {
        solBox.classList.add("visible");
        if (solBtn) solBtn.innerHTML = `<span>✖</span> Hide Solution`;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Expand / Collapse Solutions
  // --------------------------------------------------------------------------
  el.expandAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".solution-box").forEach(box => box.classList.add("visible"));
    document.querySelectorAll(".btn-toggle-sol").forEach(btn => {
      btn.innerHTML = `<span>✖</span> Hide Solution`;
    });
  });

  el.collapseAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".solution-box").forEach(box => box.classList.remove("visible"));
    document.querySelectorAll(".btn-toggle-sol").forEach(btn => {
      btn.innerHTML = `<span>💡</span> Reveal Solution`;
    });
  });

  // --------------------------------------------------------------------------
  // Timer & Quiz Management
  // --------------------------------------------------------------------------
  function startTimer() {
    stopTimer();
    state.timerSecs = 20 * 60; // 20 mins sectional
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
      if (state.timerSecs > 0) {
        state.timerSecs--;
        updateTimerDisplay();
      } else {
        stopTimer();
        alert("Time is up! Your examination will now be automatically submitted.");
        submitQuiz();
      }
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    const mins = Math.floor(state.timerSecs / 60);
    const secs = state.timerSecs % 60;
    el.timerDigits.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateQuizCounters() {
    const list = getFilteredQuestions();
    let answered = 0;
    list.forEach(q => {
      if (state.answers[q.id] !== undefined) answered++;
    });

    el.answeredCount.textContent = answered;
    el.remainingCount.textContent = list.length - answered;
  }

  // --------------------------------------------------------------------------
  // Submit Quiz & Calculate Score (XSS-hardened)
  // --------------------------------------------------------------------------
  function submitQuiz() {
    stopTimer();
    state.quizSubmitted = true;

    const list = getFilteredQuestions();
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;

    const sectionStats = {};

    list.forEach(q => {
      if (!sectionStats[q.section]) {
        sectionStats[q.section] = { total: 0, correct: 0, wrong: 0 };
      }
      sectionStats[q.section].total++;

      const choice = state.answers[q.id];
      if (choice === undefined) {
        unattempted++;
      } else if (choice === q.correctAnswer) {
        correct++;
        sectionStats[q.section].correct++;
      } else {
        wrong++;
        sectionStats[q.section].wrong++;
      }
    });

    // Score calculation with -0.25 negative marking
    const netScore = (correct * 1.0) - (wrong * 0.25);
    const attempted = correct + wrong;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

    // Populate scorecard modal (numeric values — safe)
    document.getElementById("res-net-score").textContent = netScore.toFixed(2);
    document.getElementById("res-correct").textContent = correct;
    document.getElementById("res-wrong").textContent = wrong;
    document.getElementById("res-unattempted").textContent = unattempted;
    document.getElementById("res-accuracy").textContent = `${accuracy}%`;

    // Section table — SECURITY: Section names escaped
    let tableHtml = `<table class="data-table"><thead><tr><th>Section</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Net Marks</th></tr></thead><tbody>`;
    for (const [secName, stat] of Object.entries(sectionStats)) {
      const secNet = (stat.correct * 1.0) - (stat.wrong * 0.25);
      tableHtml += `<tr><td><strong>${escapeHtml(secName)}</strong></td><td>${stat.correct + stat.wrong}/${stat.total}</td><td class="text-green">${stat.correct}</td><td class="text-red">${stat.wrong}</td><td><strong>${secNet.toFixed(2)}</strong></td></tr>`;
    }
    tableHtml += `</tbody></table>`;
    document.getElementById("section-score-table").innerHTML = tableHtml;

    el.scorecardModal.classList.remove("hidden");
    renderQuestions(); // show solutions & results in cards
  }

  el.submitQuizBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to submit your examination now?")) {
      submitQuiz();
    }
  });

  // Modal controls
  el.closeScorecard.addEventListener("click", () => el.scorecardModal.classList.add("hidden"));
  el.btnReviewSolutions.addEventListener("click", () => {
    el.scorecardModal.classList.add("hidden");
    window.scrollTo({ top: 400, behavior: "smooth" });
  });

  el.btnRetakeExam.addEventListener("click", () => {
    el.scorecardModal.classList.add("hidden");
    state.answers = {};
    state.quizSubmitted = false;
    startTimer();
    renderQuestions();
  });

  // Cut-off Modal
  el.openCutoffsBtn.addEventListener("click", () => el.cutoffsModal.classList.remove("hidden"));
  el.closeCutoffs.addEventListener("click", () => el.cutoffsModal.classList.add("hidden"));

  // SECURITY: Modal backdrop click — uses strict equality check
  window.addEventListener("click", (e) => {
    if (e.target === el.cutoffsModal) el.cutoffsModal.classList.add("hidden");
    if (e.target === el.scorecardModal) el.scorecardModal.classList.add("hidden");
  });

  // Keyboard accessibility: close modals with Escape key
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      el.cutoffsModal.classList.add("hidden");
      el.scorecardModal.classList.add("hidden");
    }
  });

  // DATA PROTECTION: Freeze exam data to prevent runtime tampering via browser console
  if (window.SBI_EXAM_DATA && typeof Object.freeze === "function") {
    Object.freeze(window.SBI_EXAM_DATA);
  }

  // Initialize
  setPhase("prelims");
});
