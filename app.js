(function () {
  "use strict";

  const TID_BY_SCENARIO = {
    A: "alex.morgan@acmearch.com",
    B: "alex.morgan@acmearch.com",
    C: "patricia.nguyen@enterprisedesign.com",
    D: "jamie.lee@designstudioc.com",
    E: "alex.morgan@acmearch.com",
    F: "alex.morgan@acmearch.com",
  };

  const SCENARIO_E_MODAL_ALERTS = {
    "session-timeout": {
      tone: "danger",
      title: "Session expired",
      message:
        "Your Trimble ID session timed out before commerce handoff. Sign in again to continue to Secure Trimble Commerce.",
    },
    "sso-failure": {
      tone: "warning",
      title: "SSO redirect failed",
      message:
        "Enterprise federated SSO could not complete the redirect to Trimble Commerce. Retry sign-in or contact your IT administrator.",
    },
    "currency-region": {
      tone: "warning",
      title: "Currency or region mismatch",
      message:
        "Your account entitlement does not match the storefront currency or region for this extension SKU. Choose another account or update billing region.",
    },
    "auth-block": {
      tone: "danger",
      title: "Critical transactional block",
      message:
        "Trimble Commerce blocked this handoff due to a critical authentication or transactional policy violation. Contact your administrator or Trimble support before retrying.",
    },
  };

  const SCENARIO_F_ACCOUNT_ALERTS = {
    "entitlement-timeout": {
      tone: "danger",
      title: "Unable to load accounts",
      message:
        "The entitlement service timed out while retrieving accounts for your Trimble ID. Refresh the page or try again in a few minutes.",
    },
    "zero-accounts": {
      tone: "danger",
      title: "No authorized accounts",
      message:
        "We could not find any commerce accounts you are permitted to use for this purchase. Request access from your Account Owner or create an individual account.",
    },
    "setup-incomplete": {
      tone: "warning",
      title: "Account setup incomplete",
      message:
        "One or more accounts require setup before checkout. Complete Account Setup for the selected organization to continue.",
    },
    "permission-downgrade": {
      tone: "warning",
      title: "Permissions changed during session",
      message:
        "Buyer authorization changed while you were signed in. Review updated account badges before continuing.",
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

  const PRODUCT = {
    name: "DBS - Round edges corners 2",
    priceLabel: "$12.00",
    developer: "DBS",
    sku: "SUEW-DBS-REC2",
  };

  const state = {
    purchaseMenuOpen: false,
    scenario: "A",
    permission: "BUYER",
    nonBuyerRole: null,
    route: "/",
    selectedAccountId: null,
    modalOpen: false,
    accountEntitlementLoaded: false,
    accountSelectionFailureFocusKey: null,
  };

  const els = {
    views: () => document.querySelectorAll(".view"),
    scenarioRadios: () => document.querySelectorAll('input[name="scenario"]'),
    scenarioSubstatePanel: () => document.getElementById("scenario-substate-panel"),
    dvwStateWrap: () => document.getElementById("dvw-state-wrap"),
    dvwStateRadios: () => document.querySelectorAll('input[name="dvw-state"]'),
    dvwStateBRadios: () => document.querySelectorAll('input[name="dvw-state-b"]'),
    dvwStateERadios: () => document.querySelectorAll('input[name="dvw-state-e"]'),
    dvwStateFRadios: () => document.querySelectorAll('input[name="dvw-state-f"]'),
    simTid: () => document.getElementById("sim-tid"),
    modalTid: () => document.getElementById("modal-tid"),
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
    modalBodyLead: () => document.getElementById("modal-body-lead"),
    accountGrid: () => document.getElementById("account-grid"),
    continueCheckout: () => document.getElementById("btn-continue-checkout"),
    cancelSuew: () => document.getElementById("link-cancel-suew"),
    requestContext: () => document.getElementById("request-context"),
  };

  function getScenario() {
    return state.scenario;
  }

  function getTid() {
    return TID_BY_SCENARIO[getScenario()] || TID_BY_SCENARIO.A;
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
    const selected = document.querySelector('input[name="dvw-state-b"]:checked');
    return selected ? selected.value : "full-matrix";
  }

  function getScenarioESubstate() {
    const selected = document.querySelector('input[name="dvw-state-e"]:checked');
    return selected ? selected.value : "session-timeout";
  }

  function getScenarioFSubstate() {
    const selected = document.querySelector('input[name="dvw-state-f"]:checked');
    return selected ? selected.value : "entitlement-timeout";
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

  function accountsForSelectionPage() {
    const scenario = getScenario();
    if (scenario === "B") {
      if (getScenarioBSubstate() === "ao-sao-only") {
        return applyScenarioBCheckoutAuthority(
          ACCOUNTS_MULTI.filter((account) => account.buyerAuthorized)
        );
      }
      return applyScenarioBCheckoutAuthority(ACCOUNTS_MULTI);
    }
    if (scenario === "F") {
      const sub = getScenarioFSubstate();
      if (sub === "zero-accounts") {
        return [];
      }
      if (sub === "setup-incomplete") {
        return ACCOUNTS_MULTI.map((account) => {
          const copy = cloneAccount(account);
          if (copy.buyerAuthorized) {
            copy.checkoutReady = false;
          }
          return copy;
        });
      }
      if (sub === "permission-downgrade") {
        return ACCOUNTS_MULTI.map((account) => {
          const copy = cloneAccount(account);
          if (copy.id === "894201") {
            copy.buyerAuthorized = false;
            copy.checkoutReady = false;
          }
          return copy;
        });
      }
      return ACCOUNTS_MULTI.map(cloneAccount);
    }
    return ACCOUNTS_MULTI;
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
    if (getScenario() !== "E") {
      host.hidden = true;
      host.innerHTML = "";
      if (continueBtn) {
        continueBtn.disabled = false;
      }
      return;
    }
    const sub = getScenarioESubstate();
    const alertDef = SCENARIO_E_MODAL_ALERTS[sub];
    if (!alertDef) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.innerHTML = renderProtoAlertMarkup(alertDef);
    host.hidden = false;
    if (continueBtn) {
      continueBtn.disabled =
        sub === "session-timeout" || sub === "auth-block";
    }
  }

  function isAccountEntitlementFailureActive() {
    return (
      getScenario() === "F" &&
      getScenarioFSubstate() === "entitlement-timeout" &&
      !state.accountEntitlementLoaded
    );
  }

  function renderAccountEntitlementServiceError(shouldFocusHeading) {
    const serviceError = document.getElementById("account-selection-service-error");
    if (!serviceError) {
      return;
    }
    serviceError.innerHTML =
      '<div class="account-selection-service-error__inner">' +
      '<div class="account-selection-service-error__main">' +
      '<div class="account-selection-service-error__icon" aria-hidden="true">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" focusable="false" class="account-selection-service-error__icon-svg">' +
      '<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>' +
      "</svg></div>" +
      '<div class="account-selection-service-error__copy">' +
      '<h2 class="account-selection-service-error__heading" id="account-selection-failure-heading" tabindex="-1">' +
      "Unable to load your available accounts" +
      "</h2>" +
      '<p class="account-selection-service-error__microcopy">' +
      "We experienced a temporary connection issue while retrieving your corporate account profiles from the Customer Data Hub. Your shopping cart items are safely saved." +
      "</p>" +
      "</div></div>" +
      '<div class="account-selection-service-error__actions">' +
      '<button type="button" class="btn btn--primary account-selection-service-error__retry" id="btn-retry-accounts">' +
      "Retry Loading Accounts" +
      "</button>" +
      '<a href="#" class="account-selection-service-error__support" id="link-trimble-support">Contact Support</a>' +
      "</div></div>";
    serviceError.setAttribute("role", "status");
    serviceError.setAttribute("aria-live", "polite");
    serviceError.hidden = false;

    if (shouldFocusHeading) {
      window.requestAnimationFrame(() => {
        const heading = document.getElementById("account-selection-failure-heading");
        if (heading) {
          heading.focus();
        }
      });
    }
  }

  function renderAccountZeroAccountsEmptyState(shouldFocusHeading) {
    const emptyHost = document.getElementById("account-selection-empty-host");
    if (!emptyHost) {
      return;
    }
    emptyHost.innerHTML =
      '<h2 class="account-selection-empty__heading" id="account-selection-zero-heading" tabindex="-1">' +
      "No authorized accounts" +
      "</h2>" +
      '<p class="account-selection-empty__message">' +
      "We could not find any commerce accounts you are permitted to use for this purchase. Request access from your Account Owner or create an individual account." +
      "</p>" +
      '<div class="account-selection-empty__actions">' +
      '<button type="button" class="btn btn--primary" id="btn-zero-setup-account">' +
      "Set Up New Account" +
      "</button>" +
      '<a href="#" class="checkout-link account-selection-empty__request" id="link-zero-request-access">' +
      "Request Access" +
      "</a>" +
      "</div>";

    if (shouldFocusHeading) {
      window.requestAnimationFrame(() => {
        const heading = document.getElementById("account-selection-zero-heading");
        if (heading) {
          heading.focus();
        }
      });
    }
  }

  function onRetryAccountEntitlementLoad() {
    state.accountEntitlementLoaded = true;
    state.selectedAccountId = null;
    state.accountSelectionFailureFocusKey = null;
    if (state.route === "/account-selection") {
      renderAccountGrid();
      updateDockButton();
      syncAccountSelectionErrorUi();
      const dockBtn = els.continueCheckout();
      if (dockBtn) {
        dockBtn.focus();
      }
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

    if (getScenario() !== "F") {
      state.accountEntitlementLoaded = false;
      state.accountSelectionFailureFocusKey = null;
      return;
    }

    const sub = getScenarioFSubstate();
    if (sub !== "entitlement-timeout") {
      state.accountEntitlementLoaded = false;
    }

    if (sub === "entitlement-timeout" && !state.accountEntitlementLoaded) {
      grid.classList.add("account-grid--hidden");
      if (dock) {
        dock.classList.add("account-dock--hidden");
      }
      const focusKey = "entitlement-timeout";
      const shouldFocus = state.accountSelectionFailureFocusKey !== focusKey;
      if (shouldFocus) {
        state.accountSelectionFailureFocusKey = focusKey;
      }
      renderAccountEntitlementServiceError(shouldFocus);
      return;
    }

    if (sub === "zero-accounts") {
      grid.classList.add("account-grid--hidden");
      if (dock) {
        dock.classList.add("account-dock--hidden");
      }
      const focusKey = "zero-accounts";
      const shouldFocus = state.accountSelectionFailureFocusKey !== focusKey;
      if (shouldFocus) {
        state.accountSelectionFailureFocusKey = focusKey;
      }
      renderAccountZeroAccountsEmptyState(shouldFocus);
      emptyHost.hidden = false;
      return;
    }

    state.accountSelectionFailureFocusKey = null;

    const alertDef = SCENARIO_F_ACCOUNT_ALERTS[sub];
    if (!alertDef) {
      return;
    }

    errorHost.innerHTML = renderProtoAlertMarkup(alertDef);
    errorHost.hidden = false;
  }

  function onScenarioBSubstateChange() {
    const visibleIds = new Set(accountsForSelectionPage().map((account) => account.id));
    if (state.selectedAccountId && !visibleIds.has(state.selectedAccountId)) {
      state.selectedAccountId = null;
    }
    if (state.route === "/account-selection") {
      renderAccountGrid();
      updateDockButton();
    }
    syncPrototypeChromeTop();
  }

  function onScenarioESubstateChange() {
    updateSecurityModalContent();
    syncPrototypeChromeTop();
  }

  function onScenarioFSubstateChange() {
    state.accountEntitlementLoaded = false;
    state.accountSelectionFailureFocusKey = null;
    const visibleIds = new Set(accountsForSelectionPage().map((account) => account.id));
    if (state.selectedAccountId && !visibleIds.has(state.selectedAccountId)) {
      state.selectedAccountId = null;
    }
    if (state.route === "/account-selection") {
      renderAccountGrid();
      updateDockButton();
    }
    syncPrototypeChromeTop();
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
    const modalTid = els.modalTid();
    if (modalTid) {
      modalTid.textContent = tid;
      modalTid.setAttribute("title", tid);
    }
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
    const price = PRODUCT.priceLabel;

    const cdhEl = document.getElementById("checkout-dev-account-id");
    if (cdhEl) {
      cdhEl.textContent = "#" + account.cdhId;
    }

    const headerMeta = document.getElementById("checkout-header-meta");
    if (headerMeta) {
      headerMeta.textContent = "1 item | Subtotal " + price;
    }

    const priceText = price;
    ["checkout-subtotal", "checkout-total", "checkout-cart-unit-price"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = id === "checkout-cart-unit-price" ? priceText + " USD per user" : priceText;
      }
    });

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

    const devNote = document.getElementById("request-dev-note-body");
    if (devNote) {
      const roleLabel = role || "Non-Buyer";
      devNote.textContent =
        "Developer Note (Non-Buyer / " +
        roleLabel +
        " Flow): Scenario C/D or account-selection Non-Buyer routes land on Stub 3 (Request Purchase). Permission state: " +
        permission +
        ". Clicking 'SEND REQUEST' dispatches an asynchronous approval notification to the designated Account Owner inside the Trimble Admin Console carrying the user's Trimble ID (" +
        tid +
        "), role (" +
        roleLabel +
        "), and SUEW SKU payload.";
    }
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

  function bindAccountSelectionServiceErrorHost() {
    const host = document.getElementById("account-selection-service-error");
    if (!host || host.dataset.actionsBound) {
      return;
    }
    host.dataset.actionsBound = "true";
    host.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.id === "btn-retry-accounts") {
        e.preventDefault();
        onRetryAccountEntitlementLoad();
      }
      if (target.id === "link-trimble-support") {
        e.preventDefault();
        showAppToast("Prototype: Contact Trimble Support — support portal stub.");
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
  }

  function titleForRoute(path) {
    const map = {
      "/": PRODUCT.name + " — Extension Warehouse",
      "/account-selection": "Account Selection — Trimble Commerce",
      "/checkout": "Checkout — Trimble",
      "/account-setup": "Account Setup — Trimble",
      "/request-purchase": "Request account action or access — Trimble",
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
    if (getScenario() !== "A") {
      return true;
    }
    const selected = document.querySelector('input[name="dvw-state"]:checked');
    return !selected || selected.value === "exists";
  }

  function modalBodyLeadHtml() {
    const scenario = getScenario();
    const shop = '<span class="nowrap">shop.trimble.com</span>';
    if (scenario === "B") {
      return (
        "You are leaving SketchUp Extension Warehouse to select an account on Trimble Commerce (" +
        shop +
        ")."
      );
    }
    if (scenario === "C" || scenario === "D") {
      return (
        "You are leaving SketchUp Extension Warehouse to submit a purchase request on Trimble Commerce (" +
        shop +
        ")."
      );
    }
    if (scenario === "E") {
      return (
        "Security handoff error prototype — review the alert below before continuing to Trimble Commerce (" +
        shop +
        ")."
      );
    }
    if (scenario === "F") {
      return (
        "You are leaving SketchUp Extension Warehouse to select an account on Trimble Commerce (" +
        shop +
        "). Account selector error states apply on the next page."
      );
    }
    return (
      "You are leaving SketchUp Extension Warehouse to complete your order on Trimble Commerce (" +
      shop +
      ")."
    );
  }

  function modalContinueLabel() {
    const scenario = getScenario();
    if (scenario === "A") {
      return isDvwAccountExists()
        ? "Continue to Checkout"
        : "Continue to Account Setup";
    }
    if (scenario === "C" || scenario === "D") {
      return "Continue to Request Page";
    }
    if (scenario === "E") {
      const eSub = getScenarioESubstate();
      if (eSub === "session-timeout") {
        return "Sign In Again";
      }
      if (eSub === "auth-block") {
        return "Return to Extension Warehouse";
      }
      return "Continue to Account Selection";
    }
    if (scenario === "F") {
      return "Continue to Account Selection";
    }
    return "Continue to Account Selection";
  }

  function updateSecurityModalContent() {
    const lead = els.modalBodyLead();
    if (lead) {
      lead.innerHTML = modalBodyLeadHtml();
    }
    els.modalContinue().textContent = modalContinueLabel();
    syncTidDisplay();
    syncSecurityModalErrorAlert();
  }

  function handlePurchaseFromPdp() {
    closePurchaseMenu();
    openSecurityModal();
  }

  function openSecurityModal() {
    closePurchaseMenu();
    state.modalOpen = true;
    updateSecurityModalContent();

    els.backdrop().hidden = false;
    els.modal().hidden = false;
    els.backdrop().setAttribute("aria-hidden", "false");
    els.modal().setAttribute("aria-hidden", "false");

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
    document.body.style.overflow = "";

    if (restoreFocus) {
      const tryPurchase = els.tryPurchaseBtn();
      if (tryPurchase) {
        tryPurchase.focus();
      }
    }
  }

  function evaluateContinueFromModal() {
    const scenario = getScenario();

    const eSub = getScenarioESubstate();
    if (scenario === "E" && (eSub === "session-timeout" || eSub === "auth-block")) {
      syncSecurityModalErrorAlert();
      return;
    }

    closeSecurityModal({ restoreFocus: false });

    if (scenario === "A") {
      if (isDvwAccountExists()) {
        routeTo("/checkout", { context: { account: SINGLE_ACCOUNT }, resetSelection: true });
      } else {
        routeTo("/account-setup", { resetSelection: true });
      }
      return;
    }

    if (scenario === "B" || scenario === "E" || scenario === "F") {
      state.accountEntitlementLoaded = false;
      state.accountSelectionFailureFocusKey = null;
      routeTo("/account-selection", { resetSelection: true });
      return;
    }

    if (scenario === "C" || scenario === "D") {
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
    const grid = els.accountGrid();
    if (isAccountEntitlementFailureActive()) {
      grid.innerHTML = "";
      syncAccountSelectionErrorUi();
      return;
    }

    const accounts = accountsForSelectionPage();
    grid.innerHTML = "";

    accounts.forEach((account) => {
      const selected = state.selectedAccountId === account.id;
      const card = document.createElement("article");
      card.className = "account-card" + (selected ? " account-card--selected" : "");
      card.setAttribute("data-account-id", account.id);

      const badge = accountBadgeMeta(account);

      card.innerHTML =
        '<div class="account-card__body">' +
        '<h2 class="account-card__name">' +
        escapeHtml(account.name) +
        "</h2>" +
        '<p class="account-card__meta">' +
        escapeHtml(account.role) +
        "</p>" +
        '<div class="account-card__badges">' +
        renderBadgeHtml(badge) +
        "</div>" +
        '<button type="button" class="btn btn--card account-card__select ' +
        (selected ? "btn--primary" : "btn--account-select-outline") +
        '" aria-checked="' +
        selected +
        '" role="radio">' +
        (selected ? "✓ Account Selected" : "Select Account") +
        "</button>" +
        "</div>";

      const btn = card.querySelector(".account-card__select");
      btn.setAttribute(
        "aria-label",
        accountSelectAriaLabel(account, badge, selected)
      );
      btn.addEventListener("click", () => selectAccount(account.id));
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectAccount(account.id);
        }
      });

      grid.appendChild(card);
    });

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
    if (isAccountEntitlementFailureActive()) {
      btn.disabled = true;
      btn.textContent = "Select an Account to Continue";
      return;
    }

    if (getScenario() === "F" && getScenarioFSubstate() === "zero-accounts") {
      btn.disabled = true;
      btn.textContent = "No Accounts Available";
      return;
    }

    const account = resolveAccountForSelection(state.selectedAccountId);

    if (!account) {
      btn.disabled = true;
      btn.textContent = "Select an Account to Continue";
      return;
    }

    btn.disabled = false;
    if (!account.buyerAuthorized) {
      btn.textContent = "Continue to Request Page";
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

  function onScenarioChange() {
    const checked = document.querySelector('input[name="scenario"]:checked');
    state.scenario = checked ? checked.value : "A";
    state.accountEntitlementLoaded = false;
    state.accountSelectionFailureFocusKey = null;
    syncScenarioPermissionState();
    syncTidDisplay();
    updateSecurityModalContent();
    toggleScenarioToggles();

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

  function toggleScenarioToggles() {
    const scenario = getScenario();
    ["A", "B", "C", "D", "E", "F"].forEach((key) => {
      const block = document.getElementById("scenario-substate-" + key.toLowerCase());
      if (block) {
        block.hidden = scenario !== key;
      }
    });
    if (state.modalOpen) {
      syncSecurityModalErrorAlert();
    }
    if (state.route === "/account-selection") {
      syncAccountSelectionErrorUi();
    }
    syncPrototypeChromeTop();
  }

  /** Keeps --prototype-chrome-top at least 88px and in sync when the utility bar grows (e.g. Scenario A DvW row). */
  function syncPrototypeChromeTop() {
    const bar = document.getElementById("prototype-control-header");
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
    const label = PRODUCT.priceLabel + " / yr";
    priceEl.textContent = label;
    priceEl.setAttribute(
      "aria-label",
      "Purchase price: " + PRODUCT.priceLabel + " per year"
    );
  }

  function initPurchaseDropdown() {
    syncPdpPriceDisplay();

    const trigger = els.tryPurchaseBtn();
    const menu = els.purchaseMenu();
    const purchaseItem = els.menuPurchase();
    if (!trigger || !menu) {
      return;
    }

    trigger.addEventListener("click", () => togglePurchaseMenu());

    trigger.addEventListener("keydown", (e) => {
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
        closePurchaseMenu();
        showAppToast("Start Free Trial — evaluation workflow stub (out of scope for checkout handoff).");
        trigger.focus();
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

    els.scenarioRadios().forEach((radio) => {
      radio.addEventListener("change", onScenarioChange);
    });
    els.dvwStateRadios().forEach((radio) => {
      radio.addEventListener("change", () => {
        updateSecurityModalContent();
        syncPrototypeChromeTop();
      });
    });
    els.dvwStateBRadios().forEach((radio) => {
      radio.addEventListener("change", onScenarioBSubstateChange);
    });
    els.dvwStateERadios().forEach((radio) => {
      radio.addEventListener("change", onScenarioESubstateChange);
    });
    els.dvwStateFRadios().forEach((radio) => {
      radio.addEventListener("change", onScenarioFSubstateChange);
    });

    window.addEventListener("resize", syncPrototypeChromeTop);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("popstate", () => {
      const path = window.location.pathname.replace(/\.html$/, "") || "/";
      const normalized =
        path.endsWith("index") || path === "" ? "/" : path.startsWith("/") ? path : "/" + path;
      if (normalized !== state.route) {
        routeTo(normalized, { replace: true });
      }
    });

    initNavigationLinks();
    initDevTooltips();
    initAppToast();
    bindAccountSelectionServiceErrorHost();
    bindAccountSelectionEmptyHost();
    initCheckoutPage();
    initRequestAccessPage();
    initAccountSetupPage();
    toggleScenarioToggles();
    syncScenarioPermissionState();
    syncTidDisplay();
    updateSecurityModalContent();
    syncPrototypeChromeTop();
    routeTo("/", { replace: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
