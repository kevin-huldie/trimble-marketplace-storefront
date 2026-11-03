(function () {
  "use strict";

  const TID_BY_SCENARIO = {
    A: "alex.morgan@acmearch.com",
    B: "alex.morgan@acmearch.com",
    C: "patricia.nguyen@enterprisedesign.com",
    D: "jamie.lee@designstudioc.com",
    E: "alex.morgan@acmearch.com",
  };

  const SANDBOX_SCENARIO_STORAGE_KEY = "prototype-scenario";
  const TRIMBLE_SANDBOX_STORAGE_KEY = "trimble_sandbox_state";
  const TRIMBLE_SANDBOX_NOTES_VISIBLE_KEY = "trimble_sandbox_notes_visible";

  const SANDBOX_DEV_DRAWER_DEFAULT = {
    title: "STAGE 1: MVP SCOPE (SUEW DIRECT CART & CHECKOUT INTEGRATION)",
    desc:
      "Delivers the baseline transactional handoff between SketchUp Extension Warehouse (SUEW) and Trimble Marketplace Direct Cart & Checkout via Trimble ID (TID) identity and Customer Data Hub (CDH) entitlement telemetry.",
    footerHtml:
      "<strong>Evaluation Guide:</strong> Toggle Role &amp; Permissions between Commercial Authorities and Operational Roles to verify how selecting &lsquo;Purchase&rsquo; from the Try or Purchase action launches the Security Redirection Modal and deterministically routes the user upon clicking &lsquo;Continue&rsquo;: routing Commercial Authorities directly to shop.trimble.com (or Account Setup if unprovisioned) and routing Operational Roles to Request Purchase (#/request-purchase).",
  };

  const SANDBOX_DEV_DRAWER_BY_ROUTE = {
    "/checkout": {
      title: "STUB: CHECKOUT (shop.trimble.com)",
      desc:
        "Validates the Direct-via-Web checkout surface for Authorized Buyers with an existing DvW e-commerce record. Session cart context and the selected CDH organization should bind to billing, order summary, and checkout actions on this page.",
      footerHtml:
        "<strong>Evaluation Guide:</strong> Reach this stub via Security Modal Continue as a Commercial Authority with DvW Account State &lsquo;Account Exists&rsquo;, or by completing Account Selector with a checkout-ready buyer account. Confirm order line items, subtotal, and that checkout header meta reflects the prototype SKU price.",
    },
    "/account-setup": {
      title: "STUB: ACCOUNT SETUP (Onboarding intercept)",
      desc:
        "Buyer organizations without a Direct-via-Web profile route here before checkout. Step 1 captures profile details; subsequent steps (Address Doctor verification and currency selection) precede transferring cart context into Checkout.",
      footerHtml:
        "<strong>Evaluation Guide:</strong> Route via Security Modal Continue when DvW Account State is &lsquo;Not Created&rsquo;, from Account Selector when setup is incomplete (Simulated Error), or when modal Continue targets Account Setup. Validate required fields, work-email format, and Step 1 enablement of Continue.",
    },
    "/request-purchase": {
      title: "STUB: REQUEST PURCHASE (Delegated requisition)",
      desc:
        "Operational roles and non-buyer entitlements land on this requisition stub instead of shop.trimble.com. Users request administrator approval or add an individual account to purchase independently.",
      footerHtml:
        "<strong>Evaluation Guide:</strong> Set Role &amp; Permissions to License Admin or Product User, choose Purchase from Try or Purchase, and Continue through the security modal—or select a non-buyer row on Account Selector. Exercise Send request and Add individual account cards.",
    },
  };

  const DEFAULT_SANDBOX_STATE = {
    ticket: "DXPBK-2012",
    role: "ao",
    isBuyer: true,
    canPurchase: true,
    purchaseType: "saas_subscription",
    releaseStage: "stage_1_mvp",
    surface: "efeff4",
    accountScope: "single_account",
    portfolioScope: "single_account",
    dvwAccountState: "account_exists",
    errorState: "none",
  };

  const BUYER_ERROR_OPTIONS = ["none", "err_account_setup_incomplete"];

  const NON_BUYER_ERROR_OPTIONS = ["none"];

  const REMOVED_ERROR_INJECTIONS = [
    "err_session_timeout",
    "err_sso_failure",
    "err_currency_mismatch",
    "err_auth_block",
    "err_service_timeout",
    "err_zero_accounts",
    "err_downgrade",
  ];

  const ACCOUNT_SELECTOR_ERROR_INJECTIONS = ["err_account_setup_incomplete"];

  const BUYER_ROLES = ["ao", "sao"];

  const RELEASE_STAGE_LABELS = {
    stage_1_mvp: "Stage 1: MVP",
    stage_2_enhanced: "Stage 2: Enhanced",
    stage_3_north_star: "Stage 3: North Star",
  };

  function getRoleMetadata(roleValue) {
    switch (roleValue) {
      case "ao":
        return { label: "Account Owner", isBuyer: true, badgeClass: "badge-authorized" };
      case "sao":
        return {
          label: "Secondary Account Owner",
          isBuyer: true,
          badgeClass: "badge-authorized",
        };
      case "admin":
        return { label: "License Admin", isBuyer: false, badgeClass: "badge-operational" };
      case "non-buyer":
      default:
        return { label: "Product User", isBuyer: false, badgeClass: "badge-operational" };
    }
  }

  function getSandboxState() {
    return { ...sandboxState };
  }

  function getEffectiveErrorState() {
    if (sandboxState.errorState) {
      return sandboxState.errorState;
    }
    if (sandboxState.errorInjection) {
      return sandboxState.errorInjection;
    }
    return "none";
  }

  function syncSandboxRoleCommerceFields(roleValue) {
    const meta = getRoleMetadata(roleValue);
    sandboxState.role = roleValue;
    sandboxState.isBuyer = meta.isBuyer;
    sandboxState.canPurchase = meta.isBuyer;
    return meta;
  }

  function buyerErrorSelectMarkup() {
    return (
      '<option value="none">None (Happy Path)</option>' +
      '<optgroup label="Account Onboarding Errors">' +
      '<option value="err_account_setup_incomplete">Account Setup Incomplete</option>' +
      "</optgroup>"
    );
  }

  function nonBuyerErrorSelectMarkup() {
    return '<option value="none">None (Happy Path - Request Purchase)</option>';
  }

  function bindSandboxAccountStateControl() {
    const accountSelect = document.getElementById("sb-account-state");
    if (!accountSelect || accountSelect.tagName !== "SELECT") {
      return;
    }
    if (accountSelect.dataset.bound === "true") {
      return;
    }
    accountSelect.dataset.bound = "true";
    accountSelect.addEventListener("change", (e) => {
      saveSandboxState({ dvwAccountState: e.target.value });
      applyDvwAccountStateCheckoutRouting();
      window.dispatchEvent(
        new CustomEvent("sandboxAccountStateChanged", {
          detail: { accountState: e.target.value },
        })
      );
      applySandboxStateToApp();
    });
  }

  function bindSandboxErrorInjectionControl() {
    const errorSelect = document.getElementById("sb-error-injection");
    if (!errorSelect) {
      return;
    }
    if (errorSelect.dataset.bound === "true") {
      return;
    }
    errorSelect.dataset.bound = "true";
    errorSelect.addEventListener("change", (e) => {
      saveSandboxState({ errorState: e.target.value });
      delete sandboxState.errorInjection;
      state.accountSelectionFailureFocusKey = null;
      applySandboxStateToApp();
    });
  }

  function updateSecondaryControlsForRole(role) {
    const isBuyer = BUYER_ROLES.indexOf(role) !== -1;
    const accountStateContainer = document.getElementById("sandbox-group-account-state");
    const errorSelect = document.getElementById("sb-error-injection");
    const current = getSandboxState();
    const priorError = getEffectiveErrorState();
    const priorDvw =
      current.dvwAccountState === "not_applicable"
        ? "account_exists"
        : current.dvwAccountState;

    if (!isBuyer) {
      if (accountStateContainer) {
        accountStateContainer.innerHTML =
          '<label for="sb-account-state">DvW Account State:</label>' +
          '<input type="text" id="sb-account-state" class="sandbox-input-readonly" value="N/A (Non-Buyer)" readonly tabindex="-1" aria-readonly="true">';
      }
      if (errorSelect) {
        errorSelect.dataset.bound = "";
        errorSelect.innerHTML = nonBuyerErrorSelectMarkup();
        errorSelect.value = "none";
        errorSelect.disabled = true;
        errorSelect.setAttribute("aria-disabled", "true");
      }
      saveSandboxState({
        isBuyer: false,
        dvwAccountState: "not_applicable",
        errorState: "none",
      });
    } else {
      if (accountStateContainer) {
        accountStateContainer.innerHTML =
          '<label for="sb-account-state">DvW Account State:</label>' +
          '<select id="sb-account-state" class="sandbox-select">' +
          '<option value="account_exists">Account Exists</option>' +
          '<option value="not_created">Not Created</option>' +
          "</select>";
        const newSelect = document.getElementById("sb-account-state");
        if (newSelect) {
          newSelect.dataset.bound = "";
          newSelect.value = priorDvw === "not_created" ? "not_created" : "account_exists";
          bindSandboxAccountStateControl();
        }
      }
      if (errorSelect) {
        errorSelect.dataset.bound = "";
        errorSelect.disabled = false;
        errorSelect.removeAttribute("aria-disabled");
        errorSelect.innerHTML = buyerErrorSelectMarkup();
        errorSelect.value =
          priorError !== "none" && BUYER_ERROR_OPTIONS.indexOf(priorError) !== -1
            ? priorError
            : "none";
      }
      saveSandboxState({
        isBuyer: true,
        dvwAccountState: priorDvw === "not_created" ? "not_created" : "account_exists",
        errorState: errorSelect ? errorSelect.value : "none",
      });
    }
    bindSandboxErrorInjectionControl();
  }

  function dispatchSandboxRoleChanged(roleValue) {
    const meta = getRoleMetadata(roleValue);
    window.dispatchEvent(
      new CustomEvent("sandboxRoleChanged", {
        detail: {
          role: roleValue,
          label: meta.label,
          isBuyer: meta.isBuyer,
          badgeClass: meta.badgeClass,
        },
      })
    );
  }

  const SANDBOX_PROMO_DISPLAY = {
    none: { line: "—", subtotal: "$12.00", total: "$12.00" },
    promo20: { line: "—", subtotal: "$12.00", total: "$12.00" },
    invalid: { line: "Invalid code", subtotal: "$12.00", total: "$12.00" },
  };

  let sandboxState = { ...DEFAULT_SANDBOX_STATE };

  const SCENARIO_E_ACCOUNT_ALERTS = {
    "scenario-e-incomplete": {
      tone: "warning",
      title: "Account setup incomplete",
      message:
        "One or more accounts require setup before checkout. Complete Account Setup for the selected organization to continue.",
    },
  };

  const NON_BUYER_STUB_BY_SCENARIO = {
    C: {
      permission: "NON_BUYER",
      role: "License Admin",
      accountId: "558812",
    },
    D: {
      permission: "NON_BUYER",
      role: "Product User",
      accountId: "663044",
    },
  };

  /** Scenario B — AO/SAO cards that carry full checkout authority in both B sub-states. */
  const SCENARIO_B_AUTHORIZED_BUYER_IDS = ["894201", "771902"];

  /** Scenario B account selection grid (4 cards). */
  const ACCOUNTS_MULTI = [
    {
      id: "894201",
      name: "Acme Architecture Corp",
      role: "Account Owner",
      cdhId: "894201",
      buyerAuthorized: true,
      checkoutReady: true,
    },
    {
      id: "771902",
      name: "Pacific NW Build Group",
      role: "Secondary Account Owner",
      cdhId: "771902",
      buyerAuthorized: true,
      checkoutReady: false,
    },
    {
      id: "558812",
      name: "Enterprise Design Group",
      role: "License Admin",
      cdhId: "558812",
      buyerAuthorized: false,
      checkoutReady: false,
    },
    {
      id: "663044",
      name: "Civil Engineering Associates",
      role: "Product User",
      cdhId: "663044",
      buyerAuthorized: false,
      checkoutReady: false,
    },
  ];

  const ACCOUNT_OWNER_NOTIFY_EMAIL = "alex.morgan@acmearch.com";

  const SINGLE_ACCOUNT = ACCOUNTS_MULTI[0];

  const CDH_ORG_TO_LEGACY_ID = {
    org_acme_main: "894201",
    org_acme_west: "771902",
    org_studio_c: "663044",
    org_civic_labs: "558812",
  };

  const MOCK_ACCOUNT_SCOPES = {
    single_account: [
      {
        id: "org_acme_main",
        name: "Acme Architecture Corp",
        accountNumber: "ACC-89211",
        role: "Account Owner",
        isAuthorizedBuyer: true,
        isDefault: true,
      },
    ],
    multi_buyer_only: [
      {
        id: "org_acme_main",
        name: "Acme Architecture Corp (HQ)",
        accountNumber: "ACC-89211",
        role: "Account Owner",
        isAuthorizedBuyer: true,
        isDefault: true,
      },
      {
        id: "org_acme_west",
        name: "Acme West Coast Studio",
        accountNumber: "ACC-44102",
        role: "Secondary Account Owner",
        isAuthorizedBuyer: true,
        isDefault: false,
      },
    ],
    multi_mixed: [
      {
        id: "org_acme_main",
        name: "Acme Architecture Corp (HQ)",
        accountNumber: "ACC-89211",
        role: "Account Owner",
        isAuthorizedBuyer: true,
        isDefault: true,
      },
      {
        id: "org_studio_c",
        name: "Studio C Consulting",
        accountNumber: "ACC-10984",
        role: "Product User",
        isAuthorizedBuyer: false,
        isDefault: false,
      },
      {
        id: "org_civic_labs",
        name: "Civic Infrastructure Labs",
        accountNumber: "ACC-77319",
        role: "License Admin",
        isAuthorizedBuyer: false,
        isDefault: false,
      },
    ],
  };

  function getAccountScope() {
    return (
      sandboxState.accountScope ||
      sandboxState.portfolioScope ||
      DEFAULT_SANDBOX_STATE.accountScope
    );
  }

  function legacyAccountFromMock(mock) {
    const legacyId = CDH_ORG_TO_LEGACY_ID[mock.id] || SINGLE_ACCOUNT.id;
    const base = findAccount(legacyId) || SINGLE_ACCOUNT;
    return {
      id: base.id,
      name: mock.name,
      role: mock.role,
      cdhId: base.cdhId,
      buyerAuthorized: mock.isAuthorizedBuyer,
      checkoutReady: mock.isAuthorizedBuyer && base.checkoutReady !== false,
      accountNumber: mock.accountNumber,
      mockOrgId: mock.id,
    };
  }

  const PRODUCT = {
    name: "DBS - Round edges corners 2",
    priceLabel: "$12.00",
    developer: "DBS",
    sku: "SUEW-DBS-REC2",
  };

  const PURCHASE_TYPE_SUBSCRIPTION = "saas_subscription";
  const PURCHASE_TYPE_FREE_TRIAL = "free_trial";

  let purchaseTriggerClickHandler = null;

  const state = {
    purchaseMenuOpen: false,
    scenario: "A",
    permission: "BUYER",
    nonBuyerRole: null,
    route: "/",
    selectedAccountId: null,
    modalOpen: false,
    accountSelectionFailureFocusKey: null,
  };

  const els = {
    views: () => document.querySelectorAll(".view"),
    simTid: () => document.getElementById("sim-tid"),
    tryPurchaseBtn: () => document.getElementById("btn-try-purchase"),
    purchaseMenu: () => document.getElementById("try-purchase-menu"),
    purchaseDropdown: () => document.getElementById("try-purchase-dropdown"),
    menuPurchase: () => document.getElementById("menu-purchase"),
    suewUserBtn: () => document.getElementById("btn-suew-user"),
    suewHeaderTid: () => document.getElementById("suew-header-tid"),
    suewAvatar: () => document.querySelector(".suew-avatar"),
    modal: () => document.getElementById("security-modal"),
    backdrop: () => document.getElementById("security-modal-backdrop"),
    modalContinue: () => document.getElementById("btn-modal-continue"),
    modalCancel: () => document.getElementById("btn-modal-cancel"),
    modalClose: () => document.getElementById("btn-modal-close"),
    modalBodyLead: () => document.getElementById("sec-modal-desc-e"),
    accountGrid: () => document.getElementById("account-grid"),
    continueCheckout: () => document.getElementById("btn-continue-checkout"),
    cancelSuew: () => document.getElementById("link-cancel-suew"),
    requestContext: () => document.getElementById("request-context"),
    devAnnotationDock: () => document.querySelector(".dev-annotation-dock"),
  };

  function getScenario() {
    return state.scenario;
  }

  function getTid() {
    const role = sandboxState.role;
    if (role === "admin") {
      return TID_BY_SCENARIO.C;
    }
    if (role === "non-buyer") {
      return TID_BY_SCENARIO.D;
    }
    return TID_BY_SCENARIO.A;
  }

  function getNonBuyerStubForScenario(scenario) {
    const key = scenario || getScenario();
    const stub = NON_BUYER_STUB_BY_SCENARIO[key];
    if (!stub) {
      return null;
    }
    const account = findAccount(stub.accountId);
    return {
      permission: stub.permission,
      role: stub.role,
      account: account || {
        id: stub.accountId,
        name: key === "C" ? "Enterprise Design Group" : "Civil Engineering Associates",
        role: stub.role,
        cdhId: stub.accountId,
        buyerAuthorized: false,
        checkoutReady: false,
      },
    };
  }

  function syncScenarioPermissionState() {
    const stub = getNonBuyerStubForScenario();
    if (stub) {
      state.permission = stub.permission;
      state.nonBuyerRole = stub.role;
      return;
    }
    state.permission = "BUYER";
    state.nonBuyerRole = null;
  }

  function isNonBuyerScenario() {
    const scenario = getScenario();
    return scenario === "C" || scenario === "D";
  }

  function getScenarioBSubstate() {
    if (getAccountScope() === "multi_buyer_only") {
      return "ao-sao-only";
    }
    return "full-matrix";
  }

  function isAccountSelectorErrorInjection(injection) {
    const key = injection != null ? injection : getEffectiveErrorState();
    return ACCOUNT_SELECTOR_ERROR_INJECTIONS.indexOf(key) !== -1;
  }

  function getScenarioESubstate() {
    return "scenario-e-incomplete";
  }

  function deriveScenarioFromSandbox() {
    if (isAccountSelectorErrorInjection()) {
      return "E";
    }
    switch (sandboxState.role) {
      case "sao":
        return "B";
      case "admin":
        return "C";
      case "non-buyer":
        return "D";
      case "ao":
      default:
        if (getAccountScope() === "single_account") {
          return "A";
        }
        return "B";
    }
  }

  function normalizeSandboxFeatureControls() {
    const validPortfolio = ["single_account", "multi_buyer_only", "multi_mixed"];
    if (sandboxState.portfolioScope && !sandboxState.accountScope) {
      sandboxState.accountScope = sandboxState.portfolioScope;
    }
    if (validPortfolio.indexOf(sandboxState.accountScope) === -1) {
      sandboxState.accountScope = DEFAULT_SANDBOX_STATE.accountScope;
    }
    sandboxState.portfolioScope = sandboxState.accountScope;
    if (sandboxState.dvwAccountState === "account_not_created") {
      sandboxState.dvwAccountState = "not_created";
    }
    if (
      sandboxState.dvwAccountState !== "account_exists" &&
      sandboxState.dvwAccountState !== "not_created"
    ) {
      sandboxState.dvwAccountState = DEFAULT_SANDBOX_STATE.dvwAccountState;
    }
    if (sandboxState.errorInjection && !sandboxState.errorState) {
      sandboxState.errorState = sandboxState.errorInjection;
    }
    delete sandboxState.errorInjection;
    if (sandboxState.errorState === "setup_incomplete") {
      sandboxState.errorState = "err_account_setup_incomplete";
    }
    if (!sandboxState.errorState) {
      sandboxState.errorState = "none";
    }
    if (REMOVED_ERROR_INJECTIONS.indexOf(sandboxState.errorState) !== -1) {
      sandboxState.errorState = "none";
    }
    if (typeof sandboxState.isBuyer !== "boolean") {
      sandboxState.isBuyer = BUYER_ROLES.indexOf(sandboxState.role) !== -1;
    }
    const allowedErrors = sandboxState.isBuyer ? BUYER_ERROR_OPTIONS : NON_BUYER_ERROR_OPTIONS;
    if (allowedErrors.indexOf(sandboxState.errorState) === -1) {
      sandboxState.errorState = "none";
    }
    sandboxState.canPurchase = sandboxState.isBuyer;
  }

  function loadSandboxState() {
    sandboxState = { ...DEFAULT_SANDBOX_STATE };
    try {
      const raw = sessionStorage.getItem(TRIMBLE_SANDBOX_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        sandboxState = { ...DEFAULT_SANDBOX_STATE, ...parsed };
      }
    } catch (err) {
      sandboxState = { ...DEFAULT_SANDBOX_STATE };
    }
    migrateLegacyScenarioIntoSandbox();
    syncSandboxRoleCommerceFields(sandboxState.role);
    normalizeSandboxPurchaseType();
    normalizeReleaseStage();
    normalizeSandboxFeatureControls();
  }

  function normalizeReleaseStage() {
    sandboxState.releaseStage = DEFAULT_SANDBOX_STATE.releaseStage;
  }

  function getReleaseStageModalTier(stage) {
    if (stage === "stage_3_north_star") {
      return "advanced";
    }
    if (stage === "stage_2_enhanced") {
      return "standard";
    }
    return "basic";
  }

  function getReleaseStageCartFlyoutCapability(stage) {
    if (stage === "stage_3_north_star") {
      return "full";
    }
    if (stage === "stage_2_enhanced") {
      return "expanded";
    }
    return "core";
  }

  function applyReleaseStageBranches(stage) {
    const label = RELEASE_STAGE_LABELS[stage] || stage;
    const modalTier = getReleaseStageModalTier(stage);
    const cartFlyoutCapability = getReleaseStageCartFlyoutCapability(stage);
    const toolbar = document.getElementById("sandbox-toolbar");
    const modal = document.getElementById("security-modal");
    const checkoutView = document.getElementById("view-checkout");
    if (toolbar) {
      toolbar.dataset.releaseStage = stage;
    }
    if (modal) {
      modal.dataset.prototypeModalTier = modalTier;
    }
    if (checkoutView) {
      checkoutView.dataset.cartFlyoutCapability = cartFlyoutCapability;
    }

    console.info("[DXPBK-2012] Release stage branch", {
      stage,
      label,
      modalTier,
      cartFlyoutCapability,
    });
  }

  function normalizeSandboxPurchaseType() {
    sandboxState.purchaseType = PURCHASE_TYPE_SUBSCRIPTION;
  }

  function isFreeTrialPurchaseType() {
    return sandboxState.purchaseType === PURCHASE_TYPE_FREE_TRIAL;
  }

  function getCommercePriceLabel() {
    return isFreeTrialPurchaseType() ? "$0.00" : PRODUCT.priceLabel;
  }

  function migrateLegacyScenarioIntoSandbox() {
    try {
      const legacy = sessionStorage.getItem(SANDBOX_SCENARIO_STORAGE_KEY);
      if (!legacy || sessionStorage.getItem(TRIMBLE_SANDBOX_STORAGE_KEY)) {
        return;
      }
      const scenario = legacy === "F" ? "E" : legacy;
      if (scenario === "E") {
        sandboxState.errorState = "err_account_setup_incomplete";
      } else if (scenario === "B") {
        sandboxState.role = "sao";
      } else if (scenario === "C") {
        sandboxState.role = "admin";
      } else if (scenario === "D") {
        sandboxState.role = "non-buyer";
      } else {
        sandboxState.role = "ao";
      }
    } catch (err) {
      /* ignore */
    }
  }

  function saveSandboxState(updatedFields) {
    if (updatedFields && typeof updatedFields === "object") {
      Object.assign(sandboxState, updatedFields);
    }
    normalizeSandboxFeatureControls();
    syncSandboxRoleCommerceFields(sandboxState.role);
    try {
      sessionStorage.setItem(TRIMBLE_SANDBOX_STORAGE_KEY, JSON.stringify(sandboxState));
    } catch (err) {
      /* ignore */
    }
    try {
      sessionStorage.setItem(SANDBOX_SCENARIO_STORAGE_KEY, deriveScenarioFromSandbox());
    } catch (err2) {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent("sandboxStateChanged", { detail: getSandboxState() })
    );
  }

  function syncSandboxSelectsToState() {
    const map = {
      "sb-role": "role",
      "sb-account-scope": "accountScope",
      "sb-error-injection": "errorState",
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (el && sandboxState[map[id]] != null) {
        el.value = sandboxState[map[id]];
      }
    });
    const accountStateEl = document.getElementById("sb-account-state");
    if (
      accountStateEl &&
      accountStateEl.tagName === "SELECT" &&
      sandboxState.dvwAccountState !== "not_applicable"
    ) {
      accountStateEl.value =
        sandboxState.dvwAccountState === "not_created" ? "not_created" : "account_exists";
    }
  }

  function readSandboxSelectsIntoState() {
    const map = {
      "sb-role": "role",
      "sb-account-scope": "accountScope",
      "sb-error-injection": "errorState",
    };
    Object.keys(map).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) {
        return;
      }
      if (id === "sb-role") {
        syncSandboxRoleCommerceFields(el.value);
        return;
      }
      sandboxState[map[id]] = el.value;
    });
    const accountStateEl = document.getElementById("sb-account-state");
    if (accountStateEl && accountStateEl.tagName === "SELECT") {
      sandboxState.dvwAccountState = accountStateEl.value;
    }
  }

  function syncSecurityModalSurface() {
    const panel = document.querySelector("#security-modal .security-modal-card");
    if (!panel) {
      return;
    }
    const legacy = sandboxState.surface === "ffffff";
    panel.classList.toggle("security-modal-card--legacy", legacy);
  }

  function syncAccountSelectorRoleBadge() {
    const badge = document.getElementById("account-selector-role-badge");
    if (!badge) {
      return;
    }
    const meta = getRoleMetadata(sandboxState.role);
    badge.textContent = meta.label;
    badge.classList.remove("badge-authorized", "badge-operational");
    badge.classList.add(meta.badgeClass);
  }

  function syncPromoDisplay() {
    const line = document.getElementById("checkout-promo-line");
    const subtotal = document.getElementById("checkout-subtotal");
    const total = document.getElementById("checkout-total");

    if (isFreeTrialPurchaseType()) {
      if (line) {
        line.textContent = "Evaluation — no charge";
      }
      if (subtotal) {
        subtotal.textContent = "$0.00";
      }
      if (total) {
        total.textContent = "$0.00";
      }
      return;
    }

    const promo = SANDBOX_PROMO_DISPLAY.promo20;
    if (line) {
      line.textContent = promo.line;
    }
    if (subtotal) {
      subtotal.textContent = promo.subtotal;
    }
    if (total) {
      total.textContent = promo.total;
    }
  }

  function applySandboxStateToApp() {
    state.scenario = deriveScenarioFromSandbox();
    state.accountSelectionFailureFocusKey = null;
    syncScenarioPermissionState();
    syncTidDisplay();
    syncSecurityModalSurface();
    syncAccountSelectorRoleBadge();
    syncPurchaseTypeUi();
    syncPromoDisplay();
    applyReleaseStageBranches(sandboxState.releaseStage);
    applyDvwAccountStateCheckoutRouting();
    updateSecurityModalContent();

    if (state.route === "/account-selection") {
      renderAccountGrid();
      updateDockButton();
      syncAccountSelectionErrorUi();
    }
    if (state.route === "/request-purchase" && isNonBuyerScenario()) {
      syncRequestAccessPage({});
    }
    if (state.modalOpen) {
      updateSecurityModalContent();
    }
    syncPrototypeChromeTop();
  }

  function applyDvwAccountStateCheckoutRouting() {
    const toolbar = document.getElementById("sandbox-toolbar");
    if (toolbar) {
      toolbar.dataset.dvwAccountState = sandboxState.dvwAccountState;
    }
    if (state.modalOpen) {
      syncModalContinueButton();
      syncSecurityModalErrorAlert();
    }
  }

  function activateFreeTrial() {
    closePurchaseMenu();
    state.route = "/trial-activation";
    try {
      window.history.pushState({ route: "/trial-activation" }, "", "./trial-activation");
    } catch (err) {
      /* file:// or restricted */
    }
    document.title = titleForRoute("/trial-activation");
    showAppToast(
      "Free trial activated for " +
        getTid() +
        ". Evaluation license provisioned (prototype stub)."
    );
    const trigger = els.tryPurchaseBtn();
    if (trigger) {
      trigger.focus();
    }
  }

  function syncPurchaseTypeUi() {
    syncPdpPriceDisplay();

    const trigger = els.tryPurchaseBtn();
    const menu = els.purchaseMenu();
    const dropdown = els.purchaseDropdown();
    if (!trigger) {
      return;
    }

    closePurchaseMenu();
    const chevron = trigger.querySelector(".split-dropdown__chevron");
    const labelSpan = trigger.querySelector("span:not(.split-dropdown__chevron)");
    const purchaseItem = els.menuPurchase();

    if (isFreeTrialPurchaseType()) {
      if (labelSpan) {
        labelSpan.textContent = "Start Free Trial";
      }
      trigger.setAttribute("aria-haspopup", "false");
      trigger.removeAttribute("aria-controls");
      if (chevron) {
        chevron.hidden = true;
      }
      if (menu) {
        menu.hidden = true;
      }
      if (dropdown) {
        dropdown.classList.add("split-dropdown--single-cta");
      }
      return;
    }

    if (labelSpan) {
      labelSpan.textContent = "Try or Purchase";
    }
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-controls", "try-purchase-menu");
    if (chevron) {
      chevron.hidden = false;
    }
    if (menu && !state.purchaseMenuOpen) {
      menu.hidden = true;
    }
    if (purchaseItem) {
      purchaseItem.textContent = "Purchase";
    }
    if (dropdown) {
      dropdown.classList.remove("split-dropdown--single-cta");
    }
  }

  function bindPurchaseTriggerBehavior() {
    const trigger = els.tryPurchaseBtn();
    if (!trigger) {
      return;
    }
    if (purchaseTriggerClickHandler) {
      trigger.removeEventListener("click", purchaseTriggerClickHandler);
    }
    purchaseTriggerClickHandler = () => {
      if (isFreeTrialPurchaseType()) {
        activateFreeTrial();
        return;
      }
      togglePurchaseMenu();
    };
    trigger.addEventListener("click", purchaseTriggerClickHandler);
  }

  function resolveRouteFromHash() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#/")) {
      return null;
    }
    const path = hash.slice(1).split("?")[0];
    return path || "/";
  }

  function syncSandboxDevDrawerForRoute(path) {
    const routeKey = path || "/";
    const copy =
      SANDBOX_DEV_DRAWER_BY_ROUTE[routeKey] || SANDBOX_DEV_DRAWER_DEFAULT;
    const titleEl = document.getElementById("sb-dev-note-title");
    const descEl = document.querySelector("#sb-dev-drawer .sandbox-dev-desc");
    const footerEl = document.querySelector(
      "#sb-dev-drawer .sandbox-dev-footer-text"
    );
    if (titleEl) {
      titleEl.textContent = copy.title;
    }
    if (descEl) {
      descEl.textContent = copy.desc;
    }
    if (footerEl) {
      footerEl.innerHTML = copy.footerHtml;
    }
  }

  function setSandboxDevNotesVisible(visible) {
    const panel = document.getElementById("sb-notes-panel");
    const toggle = document.getElementById("sb-notes-toggle-btn");
    if (!panel || !toggle) {
      return;
    }
    const expanded = Boolean(visible);
    panel.classList.toggle("is-hidden", !expanded);
    panel.setAttribute("aria-hidden", expanded ? "false" : "true");
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.textContent = expanded ? "Hide Dev Notes" : "Show Dev Notes";
    try {
      sessionStorage.setItem(TRIMBLE_SANDBOX_NOTES_VISIBLE_KEY, expanded ? "true" : "false");
    } catch (err) {
      /* ignore */
    }
    syncPrototypeChromeTop();
  }

  function initSandboxDevNotesDrawer() {
    const toggle = document.getElementById("sb-notes-toggle-btn");
    if (!toggle || toggle.dataset.bound === "true") {
      return;
    }
    toggle.dataset.bound = "true";

    let visible = false;
    try {
      visible = sessionStorage.getItem(TRIMBLE_SANDBOX_NOTES_VISIBLE_KEY) === "true";
    } catch (err) {
      visible = false;
    }
    setSandboxDevNotesVisible(visible);

    toggle.addEventListener("click", () => {
      const panel = document.getElementById("sb-notes-panel");
      const isHidden = panel && panel.classList.contains("is-hidden");
      setSandboxDevNotesVisible(isHidden);
    });
  }

  function initSandboxToolbar() {
    loadSandboxState();

    const roleSelect = document.getElementById("sb-role");
    if (roleSelect) {
      roleSelect.value = sandboxState.role;
    }
    const scopeSelect = document.getElementById("sb-account-scope");
    if (scopeSelect) {
      scopeSelect.value = getAccountScope();
    }

    updateSecondaryControlsForRole(sandboxState.role);
    const errorSelect = document.getElementById("sb-error-injection");
    if (errorSelect) {
      errorSelect.value = getEffectiveErrorState();
    }

    saveSandboxState();
    applySandboxStateToApp();
    bindPurchaseTriggerBehavior();

    if (roleSelect) {
      roleSelect.addEventListener("change", (e) => {
        updateSecondaryControlsForRole(e.target.value);
        syncAccountSelectorRoleBadge();
        dispatchSandboxRoleChanged(e.target.value);
        saveSandboxState({ role: e.target.value });
        applySandboxStateToApp();
      });
    }

    if (scopeSelect) {
      scopeSelect.addEventListener("change", (e) => {
        const newScope = e.target.value;
        saveSandboxState({ accountScope: newScope, portfolioScope: newScope });
        state.selectedAccountId = null;
        window.dispatchEvent(
          new CustomEvent("sandboxAccountSelectorScopeChanged", {
            detail: {
              accountSelectorScope: newScope,
              accountSelectorAccounts: MOCK_ACCOUNT_SCOPES[newScope],
            },
          })
        );
        renderAccountSelectorCards(MOCK_ACCOUNT_SCOPES[newScope]);
        applySandboxStateToApp();
      });
    }

    const toggleBtn = document.getElementById("sb-toggle-btn");
    const subRow = document.getElementById("sb-sub-row");
    if (toggleBtn && subRow) {
      toggleBtn.addEventListener("click", () => {
        const collapsed = subRow.classList.toggle("is-collapsed");
        toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        toggleBtn.textContent = collapsed ? "+" : "−";
        syncPrototypeChromeTop();
      });
    }
  }

  function cloneAccount(account) {
    return {
      id: account.id,
      name: account.name,
      role: account.role,
      cdhId: account.cdhId,
      buyerAuthorized: account.buyerAuthorized,
      checkoutReady: account.checkoutReady,
    };
  }

  function applyScenarioBCheckoutAuthority(accounts) {
    return accounts.map((account) => {
      const copy = cloneAccount(account);
      if (
        copy.buyerAuthorized &&
        SCENARIO_B_AUTHORIZED_BUYER_IDS.indexOf(copy.id) !== -1
      ) {
        copy.checkoutReady = true;
      }
      return copy;
    });
  }

  function accountsForPortfolioBase() {
    const scope = getAccountScope();
    const mocks = MOCK_ACCOUNT_SCOPES[scope] || MOCK_ACCOUNT_SCOPES.single_account;
    return mocks.map((mock) => {
      const account = legacyAccountFromMock(mock);
      return cloneAccount(account);
    });
  }

  function renderAccountSelectorCards(accounts) {
    const flyout = document.querySelector(".account-selector-flyout");
    if (!flyout) {
      return;
    }

    const scope = getAccountScope();
    const isSingle = scope === "single_account";
    const mockList = accounts || MOCK_ACCOUNT_SCOPES[scope] || MOCK_ACCOUNT_SCOPES.single_account;

    flyout.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "account-grid account-card-grid";
    grid.id = "account-grid";
    grid.setAttribute(
      "role",
      isSingle ? "list" : "radiogroup"
    );
    grid.setAttribute("aria-labelledby", "account-selection-panel-title");
    grid.setAttribute("aria-describedby", "account-selection-panel-note");

    mockList.forEach((mock) => {
      const legacyId = CDH_ORG_TO_LEGACY_ID[mock.id] || SINGLE_ACCOUNT.id;
      const account = legacyAccountFromMock(mock);
      const selected = state.selectedAccountId === legacyId;
      const card = document.createElement("article");
      card.className = "account-card" + (selected ? " account-card--selected" : "");
      card.setAttribute("data-account-id", legacyId);
      card.setAttribute("data-cdh-org-id", mock.id);

      let badgesHtml = "";
      if (mock.isAuthorizedBuyer) {
        badgesHtml =
          '<span class="badge badge--authorized-buyer modus-badge-success">Authorized Buyer</span>';
      } else {
        badgesHtml =
          '<span class="badge badge--non-buyer account-selector-badge-neutral">Non-Purchasing Account</span>';
      }

      let actionHtml = "";
      if (isSingle) {
        if (mock.isDefault) {
          state.selectedAccountId = legacyId;
        }
        actionHtml =
          '<p class="account-card__active-label">Active organization for this session</p>';
      } else if (!mock.isAuthorizedBuyer) {
        actionHtml =
          '<p class="account-card__request-tag">Non-Purchasing Account — Request Only</p>' +
          '<button type="button" class="btn btn--card account-card__select btn--account-select-outline" disabled aria-disabled="true">Select Account</button>';
      } else {
        actionHtml =
          '<button type="button" class="btn btn--card account-card__select ' +
          (selected ? "btn--primary" : "btn--account-select-outline") +
          '" aria-checked="' +
          selected +
          '" role="radio">' +
          (selected ? "✓ Account Selected" : "Select Account") +
          "</button>";
      }

      card.innerHTML =
        '<div class="account-card__body">' +
        '<h2 class="account-card__name">' +
        escapeHtml(mock.name) +
        "</h2>" +
        '<p class="account-card__meta">' +
        escapeHtml(mock.role) +
        "</p>" +
        '<p class="account-card__account-number">' +
        escapeHtml(mock.accountNumber) +
        "</p>" +
        '<div class="account-card__badges">' +
        badgesHtml +
        "</div>" +
        actionHtml +
        "</div>";

      if (!isSingle && mock.isAuthorizedBuyer) {
        const btn = card.querySelector(".account-card__select");
        const badge = accountBadgeMeta(account);
        btn.setAttribute(
          "aria-label",
          accountSelectAriaLabel(account, badge, selected)
        );
        btn.addEventListener("click", () => selectAccount(legacyId));
        btn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectAccount(legacyId);
          }
        });
      }

      grid.appendChild(card);
    });

    flyout.appendChild(grid);
    updateDockButton();
  }

  function accountsForSelectionPage() {
    let accounts = applyScenarioBCheckoutAuthority(accountsForPortfolioBase());

    if (getScenario() !== "E") {
      return accounts;
    }

    const sub = getScenarioESubstate();
    if (sub === "scenario-e-incomplete") {
      return accounts.map((account) => {
        const copy = cloneAccount(account);
        if (copy.buyerAuthorized) {
          copy.checkoutReady = false;
        }
        return copy;
      });
    }
    return accounts;
  }

  function renderProtoAlertMarkup(alertDef) {
    const toneClass =
      alertDef.tone === "danger" ? "modus-proto-alert--danger" : "modus-proto-alert--warning";
    return (
      '<div class="modus-proto-alert ' +
      toneClass +
      '">' +
      '<div class="modus-proto-alert__content">' +
      '<p class="modus-proto-alert__title">' +
      escapeHtml(alertDef.title) +
      "</p>" +
      '<p class="modus-proto-alert__message">' +
      escapeHtml(alertDef.message) +
      "</p>" +
      "</div></div>"
    );
  }

  function syncSecurityModalErrorAlert() {
    const host = document.getElementById("security-modal-error-host");
    const continueBtn = els.modalContinue();
    if (!host) {
      return;
    }
    host.hidden = true;
    host.innerHTML = "";
    if (continueBtn) {
      continueBtn.disabled = false;
    }
  }

  function syncAccountSelectionErrorUi() {
    const errorHost = document.getElementById("account-selection-error-host");
    const emptyHost = document.getElementById("account-selection-empty-host");
    const serviceError = document.getElementById("account-selection-service-error");
    const dock = document.getElementById("account-selection-dock");
    const grid = els.accountGrid();
    if (!errorHost || !emptyHost || !grid) {
      return;
    }

    errorHost.hidden = true;
    errorHost.innerHTML = "";
    emptyHost.hidden = true;
    emptyHost.innerHTML = "";
    if (serviceError) {
      serviceError.hidden = true;
      serviceError.innerHTML = "";
    }
    grid.classList.remove("account-grid--hidden");
    if (dock) {
      dock.classList.remove("account-dock--hidden");
    }

    if (getScenario() !== "E") {
      state.accountSelectionFailureFocusKey = null;
      return;
    }

    state.accountSelectionFailureFocusKey = null;

    const sub = getScenarioESubstate();
    const alertDef = SCENARIO_E_ACCOUNT_ALERTS[sub];
    if (!alertDef) {
      return;
    }

    if (getEffectiveErrorState() !== "err_account_setup_incomplete") {
      return;
    }

    errorHost.innerHTML = renderProtoAlertMarkup(alertDef);
    errorHost.hidden = false;
  }

  function initialsFromTid(tid) {
    const local = String(tid).split("@")[0] || "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase() || "??";
  }

  function syncTidDisplay() {
    const tid = getTid();
    els.simTid().textContent = tid;
    const initials = initialsFromTid(tid);
    const avatar = els.suewAvatar();
    if (avatar) {
      avatar.textContent = initials;
    }
    const userBtn = els.suewUserBtn();
    if (userBtn) {
      userBtn.setAttribute("aria-label", "Signed in as " + tid);
    }
    const headerTid = els.suewHeaderTid();
    if (headerTid) {
      headerTid.textContent = "Trimble ID: " + tid;
    }
    syncRequestTidFields(tid);
  }

  function syncRequestTidFields(tid) {
    const devTid = document.getElementById("request-dev-tid");
    const inputTid = document.getElementById("request-tid");
    if (devTid) {
      devTid.textContent = tid;
    }
    if (inputTid) {
      inputTid.value = tid;
    }
  }

  function syncCheckoutPage(context) {
    const account = context.account || findAccount(state.selectedAccountId) || SINGLE_ACCOUNT;
    const price = getCommercePriceLabel();

    const cdhEl = document.getElementById("checkout-dev-account-id");
    if (cdhEl) {
      cdhEl.textContent = "#" + account.cdhId;
    }

    const headerMeta = document.getElementById("checkout-header-meta");
    if (headerMeta) {
      headerMeta.textContent = "1 item | Subtotal " + price;
    }

    const priceText = price;
    ["checkout-cart-unit-price"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = priceText + " USD per user";
      }
    });
    syncPromoDisplay();

    const productName = document.getElementById("checkout-cart-product-name");
    if (productName) {
      productName.textContent = PRODUCT.name;
    }
    const developer = document.getElementById("checkout-cart-developer");
    if (developer) {
      developer.textContent = "Developer: " + PRODUCT.developer;
    }
    const sku = document.getElementById("checkout-cart-sku");
    if (sku) {
      sku.textContent = "SKU: " + PRODUCT.sku;
    }
  }

  function syncStubViews(path, context) {
    if (path === "/checkout") {
      syncCheckoutPage(context);
    }

    if (path === "/account-setup") {
      syncAccountSetupProfileFields();
      validateSetupStep1();
    }

    if (path === "/request-purchase") {
      syncRequestAccessPage(context);
    }

    if (path === "/account-selection") {
      syncAccountSelectionErrorUi();
    }
  }

  function parseProfileFromTid(tid) {
    const local = String(tid).split("@")[0] || "";
    const parts = local.split(/[._-]+/).filter(Boolean);
    const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "");
    return {
      firstName: parts[0] ? capitalize(parts[0]) : "",
      lastName: parts.length > 1 ? capitalize(parts[parts.length - 1]) : "",
      email: tid,
    };
  }

  function syncAccountSetupProfileFields() {
    const profile = parseProfileFromTid(getTid());
    const first = document.getElementById("setup-first-name");
    const last = document.getElementById("setup-last-name");
    const email = document.getElementById("setup-email");
    if (first && !first.value.trim()) {
      first.value = profile.firstName;
      first.classList.toggle("field__input--autofill", Boolean(profile.firstName));
    }
    if (last && !last.value.trim()) {
      last.value = profile.lastName;
      last.classList.toggle("field__input--autofill", Boolean(profile.lastName));
    }
    if (email && !email.value.trim()) {
      email.value = profile.email;
      email.classList.toggle("field__input--autofill", Boolean(profile.email));
    }
  }

  function isValidWorkEmail(value) {
    const trimmed = String(value).trim();
    return trimmed.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }

  function validateSetupStep1() {
    const first = document.getElementById("setup-first-name");
    const last = document.getElementById("setup-last-name");
    const email = document.getElementById("setup-email");
    const btn = document.getElementById("btn-setup-continue");

    if (!first || !last || !email || !btn) {
      return false;
    }

    const valid =
      first.value.trim().length > 0 &&
      last.value.trim().length > 0 &&
      isValidWorkEmail(email.value);

    btn.disabled = !valid;

    return valid;
  }

  function syncRequestAccessPage(context) {
    const tid = context.tid || getTid();
    syncRequestTidFields(tid);
    const stub = getNonBuyerStubForScenario();
    const account =
      context.account ||
      (stub && stub.account) ||
      findAccount(state.selectedAccountId);
    const role = context.role || (account && account.role) || state.nonBuyerRole || "";
    const permission =
      context.permission ||
      (stub ? stub.permission : account && !account.buyerAuthorized ? "NON_BUYER" : state.permission);

    const aoEl = document.getElementById("request-ao-email");
    if (aoEl) {
      aoEl.textContent = ACCOUNT_OWNER_NOTIFY_EMAIL;
    }
    const ctx = document.getElementById("request-context");
    if (ctx) {
      ctx.textContent =
        "Session: " +
        PRODUCT.name +
        " · TID " +
        tid +
        " · Permission " +
        permission +
        (role ? " · Role " + role : "") +
        (account ? " · Account " + account.name : "");
    }
  }

  function dismissAppToast() {
    const toast = document.getElementById("app-toast");
    if (!toast || toast.hidden) {
      return;
    }
    window.clearTimeout(showAppToast._timer);
    showAppToast._timer = null;
    if (!toast.classList.contains("app-toast--visible")) {
      toast.hidden = true;
      return;
    }
    toast.classList.remove("app-toast--visible");
    const fallback = window.setTimeout(() => {
      toast.hidden = true;
    }, 300);
    const onEnd = (e) => {
      if (e.propertyName !== "opacity") {
        return;
      }
      window.clearTimeout(fallback);
      toast.hidden = true;
      toast.removeEventListener("transitionend", onEnd);
    };
    toast.addEventListener("transitionend", onEnd);
  }

  function showAppToast(message, options) {
    const toast = document.getElementById("app-toast");
    const messageEl = document.getElementById("app-toast-message");
    if (!toast || !messageEl) {
      return;
    }
    const duration = options && typeof options.duration === "number" ? options.duration : 6000;
    messageEl.textContent = message;
    toast.hidden = false;
    window.requestAnimationFrame(() => {
      toast.classList.add("app-toast--visible");
    });
    window.clearTimeout(showAppToast._timer);
    showAppToast._timer = window.setTimeout(dismissAppToast, duration);
  }

  function initAppToast() {
    const closeBtn = document.getElementById("app-toast-close");
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", dismissAppToast);
    }
  }

  function bindAccountSelectionEmptyHost() {
    const host = document.getElementById("account-selection-empty-host");
    if (!host || host.dataset.actionsBound) {
      return;
    }
    host.dataset.actionsBound = "true";
    host.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.id === "btn-zero-setup-account") {
        e.preventDefault();
        routeTo("/account-setup", { resetSelection: true, context: { individualAccount: true } });
      }
      if (target.id === "link-zero-request-access") {
        e.preventDefault();
        routeTo("/request-purchase", {
          resetSelection: true,
          context: {
            tid: getTid(),
            permission: "NON_BUYER",
            role: "Product User",
          },
        });
      }
    });
  }

  function initCheckoutPage() {
    const orderReviewBtn = document.getElementById("btn-checkout-order-review");
    if (!orderReviewBtn || orderReviewBtn.dataset.bound) {
      return;
    }
    orderReviewBtn.dataset.bound = "true";
    orderReviewBtn.addEventListener("click", () => {
      showAppToast(
        "Prototype: Checkout data captured — next steps execute Address Doctor verification, calculate tax/currency, and transfer cart context into Order Review.",
        { duration: 5000 }
      );
    });
  }

  function setPurchaseMenuOpen(open) {
    state.purchaseMenuOpen = open;
    const menu = els.purchaseMenu();
    const trigger = els.tryPurchaseBtn();
    if (!menu || !trigger) {
      return;
    }
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const purchaseItem = els.menuPurchase();
      if (purchaseItem) {
        purchaseItem.focus();
      }
    }
  }

  function closePurchaseMenu() {
    if (state.purchaseMenuOpen) {
      setPurchaseMenuOpen(false);
    }
  }

  function togglePurchaseMenu() {
    setPurchaseMenuOpen(!state.purchaseMenuOpen);
  }

  function routeTo(path, options = {}) {
    const { replace = false, context = {} } = options;
    state.route = path;
    state.selectedAccountId = options.resetSelection ? null : state.selectedAccountId;

    closePurchaseMenu();

    if (path === "/account-selection") {
      renderAccountGrid();
      updateDockButton();
    }
    syncStubViews(path, context);

    els.views().forEach((view) => {
      const viewRoute = view.getAttribute("data-route");
      const active = viewRoute === path;
      view.classList.toggle("view--active", active);
      view.hidden = !active;
    });

    if (!replace) {
      const url = path === "/" ? "./" : "." + path;
      try {
        window.history.pushState({ route: path }, "", url);
      } catch (_) {
        /* file:// or restricted */
      }
    }

    document.title = titleForRoute(path);
    syncSandboxDevDrawerForRoute(path);
  }

  function titleForRoute(path) {
    const map = {
      "/": PRODUCT.name + " — Extension Warehouse",
      "/account-selection": "Account Selection — Trimble Commerce",
      "/checkout": "Checkout — Trimble",
      "/account-setup": "Account Setup — Trimble",
      "/request-purchase": "Request account action or access — Trimble",
      "/trial-activation": "Free Trial Activation — Trimble",
    };
    return map[path] || "Trimble Commerce";
  }

  function findAccount(id) {
    return ACCOUNTS_MULTI.find((a) => a.id === id) || null;
  }

  function resolveAccountForSelection(id) {
    if (!id) {
      return null;
    }
    const fromPage = accountsForSelectionPage().find((entry) => entry.id === id);
    return fromPage || findAccount(id);
  }

  function accountSelectAriaLabel(account, badge, selected) {
    if (getScenario() === "B") {
      const permissionLabel =
        badge.className === "badge--authorized-buyer"
          ? "Authorized Buyer"
          : badge.label;
      const base = account.name + ", " + account.role + ", " + permissionLabel;
      if (selected) {
        return base + ", account selected";
      }
      if (badge.className === "badge--authorized-buyer") {
        return base + ". Click to select this account for checkout.";
      }
      return base + ". Click to select this account for purchase request.";
    }
    const parts = [account.name, account.role, badge.label];
    if (selected) {
      return parts.join(", ") + ", account selected";
    }
    return "Select account: " + parts.join(", ");
  }

  function renderBadgeHtml(badge) {
    if (badge.className === "badge--authorized-buyer") {
      return (
        '<span class="badge badge--authorized-buyer modus-badge-success">' +
        escapeHtml(badge.label) +
        "</span>"
      );
    }
    return (
      '<span class="badge ' +
      badge.className +
      '">' +
      escapeHtml(badge.label) +
      "</span>"
    );
  }

  function accountBadgeMeta(account) {
    if (!account.buyerAuthorized) {
      return { className: "badge--non-buyer", label: "Non-Buyer" };
    }
    if (!account.checkoutReady) {
      return { className: "badge--setup-needed", label: "Account Setup Needed" };
    }
    return { className: "badge--authorized-buyer", label: "Authorized Buyer" };
  }

  function isDvwAccountExists() {
    if (!sandboxState.isBuyer || sandboxState.dvwAccountState === "not_applicable") {
      return false;
    }
    return sandboxState.dvwAccountState === "account_exists";
  }

  const MODAL_RETURN_TO_SUEW_SUFFIX =
    " To return to Extension Warehouse at any time, use your browser's Back button or click Cancel.";

  function modalBodyLeadHtml() {
    const scenario = getScenario();
    const shop = '<span class="nowrap">shop.trimble.com</span>';
    if (scenario === "B" || scenario === "E") {
      return (
        "You are leaving SketchUp Extension Warehouse to select an account on Trimble Commerce (" +
        shop +
        ")." +
        MODAL_RETURN_TO_SUEW_SUFFIX
      );
    }
    if (scenario === "C" || scenario === "D") {
      return (
        "You are leaving SketchUp Extension Warehouse to submit a purchase request on Trimble Commerce (" +
        shop +
        ")." +
        MODAL_RETURN_TO_SUEW_SUFFIX
      );
    }
    return (
      "You are leaving SketchUp Extension Warehouse to complete your order on Trimble Commerce (" +
      shop +
      ")." +
      MODAL_RETURN_TO_SUEW_SUFFIX
    );
  }

  function getModalContinueActionTarget() {
    if (getEffectiveErrorState() === "err_account_setup_incomplete") {
      return "route-account-setup";
    }
    const scenario = getScenario();
    if (scenario === "A") {
      return isDvwAccountExists() ? "route-checkout" : "route-account-setup";
    }
    if (scenario === "B" || scenario === "E") {
      return "route-account-selection";
    }
    if (scenario === "C" || scenario === "D") {
      return "route-purchase-request";
    }
    return "route-account-selection";
  }

  function syncModalContinueButton() {
    const continueBtn = els.modalContinue();
    if (!continueBtn) {
      return;
    }
    continueBtn.setAttribute("data-action-target", getModalContinueActionTarget());
    continueBtn.setAttribute("aria-describedby", "sec-modal-desc-e");
  }

  function updateSecurityModalContent() {
    const lead = els.modalBodyLead();
    if (lead) {
      lead.innerHTML = modalBodyLeadHtml();
    }
    syncModalContinueButton();
    syncTidDisplay();
    syncSecurityModalErrorAlert();
  }

  function handlePurchaseFromPdp() {
    closePurchaseMenu();
    openSecurityModal();
  }

  function syncSecurityModalDevAnnotation(isVisible) {
    const dock = els.devAnnotationDock();
    if (!dock) {
      return;
    }
    dock.hidden = !isVisible;
    dock.setAttribute("aria-hidden", "true");
  }

  function openSecurityModal() {
    closePurchaseMenu();
    state.modalOpen = true;
    updateSecurityModalContent();

    els.backdrop().hidden = false;
    els.modal().hidden = false;
    els.backdrop().setAttribute("aria-hidden", "false");
    els.modal().setAttribute("aria-hidden", "false");
    syncSecurityModalDevAnnotation(true);

    els.modalContinue().focus();
    document.body.style.overflow = "hidden";
  }

  function closeSecurityModal(options) {
    const restoreFocus = !options || options.restoreFocus !== false;
    state.modalOpen = false;
    els.backdrop().hidden = true;
    els.modal().hidden = true;
    els.backdrop().setAttribute("aria-hidden", "true");
    els.modal().setAttribute("aria-hidden", "true");
    syncSecurityModalDevAnnotation(false);
    document.body.style.overflow = "";

    if (restoreFocus) {
      const tryPurchase = els.tryPurchaseBtn();
      if (tryPurchase) {
        tryPurchase.focus();
      }
    }
  }

  function evaluateContinueFromModal() {
    const continueBtn = els.modalContinue();
    const actionTarget =
      (continueBtn && continueBtn.getAttribute("data-action-target")) ||
      getModalContinueActionTarget();

    closeSecurityModal({ restoreFocus: false });

    if (actionTarget === "route-checkout") {
      routeTo("/checkout", { context: { account: SINGLE_ACCOUNT }, resetSelection: true });
      return;
    }

    if (actionTarget === "route-account-setup") {
      routeTo("/account-setup", { resetSelection: true });
      return;
    }

    if (actionTarget === "route-account-selection") {
      state.accountSelectionFailureFocusKey = null;
      routeTo("/account-selection", { resetSelection: true });
      return;
    }

    if (actionTarget === "route-purchase-request") {
      const scenario = getScenario();
      const stub = getNonBuyerStubForScenario(scenario);
      routeTo("/request-purchase", {
        resetSelection: true,
        context: {
          tid: getTid(),
          permission: stub.permission,
          role: stub.role,
          account: stub.account,
        },
      });
    }
  }

  function renderAccountGrid() {
    const scope = getAccountScope();
    let mocks = MOCK_ACCOUNT_SCOPES[scope] || MOCK_ACCOUNT_SCOPES.single_account;

    if (getScenario() === "E") {
      const legacyAccounts = accountsForSelectionPage();
      mocks = mocks.map((mock) => {
        const legacyId = CDH_ORG_TO_LEGACY_ID[mock.id];
        const adjusted = legacyAccounts.find((a) => a.id === legacyId);
        if (!adjusted) {
          return mock;
        }
        return {
          ...mock,
          isAuthorizedBuyer: adjusted.buyerAuthorized,
        };
      });
    }

    renderAccountSelectorCards(mocks);
    syncAccountSelectionErrorUi();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function selectAccount(id) {
    state.selectedAccountId = id;
    renderAccountGrid();
    updateDockButton();

    const card = els.accountGrid().querySelector('[data-account-id="' + id + '"]');
    const btn = card && card.querySelector(".account-card__select");
    if (btn) {
      btn.focus();
    }
  }

  function updateDockButton() {
    const btn = els.continueCheckout();
    const account = resolveAccountForSelection(state.selectedAccountId);

    if (!account) {
      btn.disabled = true;
      btn.textContent = "Select an Account to Continue";
      return;
    }

    btn.disabled = false;
    if (!account.buyerAuthorized) {
      btn.textContent = "Request Purchase";
    } else if (account.checkoutReady) {
      btn.textContent = "Continue to checkout";
    } else {
      btn.textContent = "Proceed to Account Setup";
    }
  }

  function onContinueFromAccountSelection() {
    const account = resolveAccountForSelection(state.selectedAccountId);
    if (!account) {
      return;
    }
    if (!account.buyerAuthorized) {
      routeTo("/request-purchase", { context: { account, tid: getTid() } });
      return;
    }
    if (account.checkoutReady) {
      routeTo("/checkout", { context: { account } });
    } else {
      routeTo("/account-setup", { context: { account } });
    }
  }

  /** Keeps --prototype-chrome-top at least 88px and in sync when the sandbox toolbar wraps. */
  function syncPrototypeChromeTop() {
    const bar = document.getElementById("sandbox-toolbar");
    if (!bar) {
      return;
    }
    const height = Math.max(88, Math.ceil(bar.getBoundingClientRect().height));
    document.documentElement.style.setProperty("--prototype-chrome-top", height + "px");
  }

  function trapModalFocus(event) {
    if (!state.modalOpen || event.key !== "Tab") {
      return;
    }
    const modal = els.modal();
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      if (state.modalOpen) {
        closeSecurityModal();
        return;
      }
      if (state.purchaseMenuOpen) {
        closePurchaseMenu();
        const tryPurchase = els.tryPurchaseBtn();
        if (tryPurchase) {
          tryPurchase.focus();
        }
        return;
      }
    }
    trapModalFocus(event);
  }

  function onDocumentClick(event) {
    if (!state.purchaseMenuOpen) {
      return;
    }
    const dropdown = els.purchaseDropdown();
    if (dropdown && !dropdown.contains(event.target)) {
      closePurchaseMenu();
    }
  }

  function activatePdpTab(tab) {
    const tablist = document.querySelector(".pdp-tabs");
    if (!tablist || !tab) {
      return;
    }
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    tabs.forEach((t) => {
      const selected = t === tab;
      t.classList.toggle("pdp-tabs__tab--active", selected);
      t.setAttribute("aria-selected", selected ? "true" : "false");
      t.tabIndex = selected ? 0 : -1;
      const pid = t.getAttribute("aria-controls");
      const p = pid ? document.getElementById(pid) : null;
      if (p) {
        const show = t === tab;
        p.hidden = !show;
        p.classList.toggle("pdp-tabpanel--active", show);
      }
    });
  }

  function initPdpTabs() {
    const tablist = document.querySelector(".pdp-tabs");
    if (!tablist) {
      return;
    }
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activatePdpTab(tab));
      tab.addEventListener("keydown", (e) => {
        const idx = tabs.indexOf(tab);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          activatePdpTab(tabs[(idx + 1) % tabs.length]);
          tabs[(idx + 1) % tabs.length].focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          activatePdpTab(tabs[(idx - 1 + tabs.length) % tabs.length]);
          tabs[(idx - 1 + tabs.length) % tabs.length].focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          activatePdpTab(tabs[0]);
          tabs[0].focus();
        } else if (e.key === "End") {
          e.preventDefault();
          activatePdpTab(tabs[tabs.length - 1]);
          tabs[tabs.length - 1].focus();
        }
      });
    });
  }

  function syncPdpPriceDisplay() {
    const priceEl = document.getElementById("pdp-price-display");
    if (!priceEl) {
      return;
    }
    if (isFreeTrialPurchaseType()) {
      priceEl.textContent = "$0.00";
      priceEl.setAttribute("aria-label", "Free trial evaluation — $0.00");
      return;
    }
    const label = PRODUCT.priceLabel + " / yr";
    priceEl.textContent = label;
    priceEl.setAttribute(
      "aria-label",
      "Purchase price: " + PRODUCT.priceLabel + " per year"
    );
  }

  function initPurchaseDropdown() {
    const trigger = els.tryPurchaseBtn();
    const menu = els.purchaseMenu();
    const purchaseItem = els.menuPurchase();
    if (!trigger || !menu) {
      return;
    }

    bindPurchaseTriggerBehavior();

    trigger.addEventListener("keydown", (e) => {
      if (isFreeTrialPurchaseType()) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateFreeTrial();
        }
        return;
      }
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setPurchaseMenuOpen(true);
      }
    });

    menu.querySelectorAll('[role="menuitem"]').forEach((item) => {
      item.addEventListener("keydown", (e) => {
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        const idx = items.indexOf(item);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          items[(idx + 1) % items.length].focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length].focus();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closePurchaseMenu();
          trigger.focus();
        }
      });
    });

    const trialItem = document.getElementById("menu-start-trial");
    if (trialItem) {
      trialItem.addEventListener("click", () => {
        activateFreeTrial();
      });
    }

    if (purchaseItem) {
      purchaseItem.addEventListener("click", handlePurchaseFromPdp);
    }
  }

  function initDevTooltips() {
    document.querySelectorAll("[data-dismiss-dev-note]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tip = btn.closest("[data-dev-tooltip]");
        if (tip) {
          tip.hidden = true;
        }
      });
    });
  }

  function initAccountSetupPage() {
    const phoneInput = document.getElementById("setup-phone");
    const phoneCount = document.getElementById("setup-phone-count");

    function updatePhoneCount() {
      if (!phoneInput || !phoneCount) {
        return;
      }
      const len = phoneInput.value.length;
      phoneCount.textContent = len + " / 15";
    }

    if (phoneInput) {
      phoneInput.addEventListener("input", updatePhoneCount);
      updatePhoneCount();
    }

    ["setup-first-name", "setup-last-name", "setup-email"].forEach((id) => {
      const input = document.getElementById(id);
      if (!input) {
        return;
      }
      input.addEventListener("input", () => {
        input.classList.remove("field__input--autofill");
        validateSetupStep1();
      });
      input.addEventListener("blur", validateSetupStep1);
    });

    validateSetupStep1();

    const continueBtn = document.getElementById("btn-setup-continue");
    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        if (!validateSetupStep1()) {
          return;
        }
        showAppToast(
          "Prototype: Step 1 saved — next steps would expand Account Address (Address Doctor) and Currency Settings."
        );
      });
    }
  }

  function initRequestAccessPage() {
    const sendBtn = document.getElementById("btn-send-request");
    const createBtn = document.getElementById("btn-create-individual-account");

    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        showAppToast(
          "Request sent to Account Owner (" +
            ACCOUNT_OWNER_NOTIFY_EMAIL +
            ") via Trimble Admin Console."
        );
      });
    }

    if (createBtn) {
      createBtn.addEventListener("click", () => {
        routeTo("/account-setup", { context: { individualAccount: true } });
      });
    }

    document.querySelectorAll(".faq-item__trigger").forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const expanded = trigger.getAttribute("aria-expanded") === "true";
        const panelId = trigger.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        const nextExpanded = !expanded;
        trigger.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
        if (panel) {
          panel.hidden = !nextExpanded;
        }
        trigger.classList.toggle("faq-item__trigger--open", nextExpanded);
        const icon = trigger.querySelector(".faq-item__icon");
        if (icon) {
          icon.textContent = nextExpanded ? "−" : "+";
        }
      });
    });
  }

  function initNavigationLinks() {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        routeTo(el.getAttribute("data-nav"), { resetSelection: true });
      });
    });

    const cancelSuew = els.cancelSuew();
    if (cancelSuew) {
      cancelSuew.addEventListener("click", (e) => {
        e.preventDefault();
        routeTo("/", { resetSelection: true });
      });
    }
  }

  function init() {
    initPdpTabs();
    initPurchaseDropdown();
    document.addEventListener("click", onDocumentClick);
    els.modalContinue().addEventListener("click", evaluateContinueFromModal);
    els.modalCancel().addEventListener("click", () => closeSecurityModal());
    const modalCloseBtn = els.modalClose();
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener("click", () => closeSecurityModal());
    }
    els.backdrop().addEventListener("click", () => closeSecurityModal());
    els.continueCheckout().addEventListener("click", onContinueFromAccountSelection);

    initSandboxToolbar();
    initSandboxDevNotesDrawer();

    window.addEventListener("resize", syncPrototypeChromeTop);

    window.addEventListener("hashchange", () => {
      const hashRoute = resolveRouteFromHash();
      if (hashRoute) {
        syncSandboxDevDrawerForRoute(hashRoute);
        if (hashRoute !== state.route) {
          routeTo(hashRoute, { replace: true });
        }
      } else {
        syncSandboxDevDrawerForRoute(state.route);
      }
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", () => {
      const path = window.location.pathname.replace(/\.html$/, "") || "/";
      const normalized =
        path.endsWith("index") || path === "" ? "/" : path.startsWith("/") ? path : "/" + path;
      if (normalized === "/trial-activation") {
        state.route = "/trial-activation";
        document.title = titleForRoute("/trial-activation");
        els.views().forEach((view) => {
          const active = view.getAttribute("data-route") === "/";
          view.classList.toggle("view--active", active);
          view.hidden = !active;
        });
        return;
      }
      if (normalized !== state.route) {
        routeTo(normalized, { replace: true });
      }
    });

    initNavigationLinks();
    initDevTooltips();
    initAppToast();
    bindAccountSelectionEmptyHost();
    initCheckoutPage();
    initRequestAccessPage();
    initAccountSetupPage();
    syncPrototypeChromeTop();
    routeTo("/", { replace: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
