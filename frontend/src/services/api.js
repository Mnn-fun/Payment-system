const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Get auth token from localStorage
const getToken = () => localStorage.getItem("token");

// Make authenticated API requests
const apiCall = async (endpoint, method = "GET", body = null) => {
  const headers = {
    "Content-Type": "application/json",
  };

  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
    credentials: "include", // Required to send HttpOnly cookies
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      let friendlyMessage = "Something went wrong. Please try again.";

      try {
        const errorData = await response.json();
        const detail = errorData.detail;

        if (typeof detail === "string") {
          // Plain string from our own HTTPException — use as-is
          friendlyMessage = detail;
        } else if (Array.isArray(detail)) {
          // FastAPI 422 Validation Error — detail is an array of {loc, msg, type}
          // Pull out each human-readable msg and join them
          friendlyMessage = detail
            .map((d) => {
              const field = d.loc ? d.loc[d.loc.length - 1] : null;
              const msg = d.msg || "Invalid value";
              return field && field !== "body" ? `${field}: ${msg}` : msg;
            })
            .join(" | ");
        } else {
          // Fallback by HTTP status
          const statusMessages = {
            400: "Bad request. Please check your input.",
            401: "Invalid credentials. Please check your email and password.",
            403: "You don't have permission to do this.",
            404: "The requested resource was not found.",
            409: "A conflict occurred. This resource may already exist.",
            422: "Invalid input. Please check the form fields.",
            500: "Server error. Please try again later.",
          };
          friendlyMessage = statusMessages[response.status] || friendlyMessage;
        }
      } catch (_) {
        // Could not parse JSON body — keep generic message
      }

      // If it's a 401 Unauthorized from a protected route, trigger session timeout
      if (response.status === 401 && !endpoint.includes("/auth/")) {
        // Attempt to refresh the token using HttpOnly refresh_token cookie
        if (!options._retry) {
            options._retry = true;
            try {
                const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
                    method: 'POST',
                    credentials: 'include'
                });
                
                if (refreshRes.ok) {
                    // Refreshed successfully! Retry original request.
                    return await apiCall(endpoint, method, body, true);
                }
            } catch (e) {
                // Ignore err, let it fall through to logout
            }
        }
        
        // Refresh failed or we already tried
        if (friendlyMessage && friendlyMessage.toLowerCase().includes("pin")) {
          // It's a PIN error, handle specially
          let attempts = parseInt(localStorage.getItem("pin_attempts") || "0", 10);
          attempts += 1;
          localStorage.setItem("pin_attempts", attempts);
          
          if (attempts >= 3) {
            localStorage.setItem("pin_attempts", 0);
            window.dispatchEvent(new CustomEvent("session-expired", { detail: { reason: "wrong-pin" } }));
          } else {
            friendlyMessage = `${friendlyMessage} You have ${3 - attempts} chance(s) left.`;
          }
        } else {
            window.dispatchEvent(new CustomEvent("session-expired", { detail: { reason: "token" } }));
        }
      }

      throw new Error(friendlyMessage);
    }
    
    if (!endpoint.includes("/auth/")) {
      localStorage.setItem("pin_attempts", "0");
    }

    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    // Convert raw browser TypeError (network down, CORS) to a friendlier error
    if (error.message === "Failed to fetch" || error.name === "TypeError") {
      throw new Error("Network error. Please check your connection.");
    }
    throw error;
  }
};

// Auth API calls
export const authAPI = {
  register: (email, password, phone_number) =>
    apiCall("/auth/register", "POST", { email, password, phone_number }),

  verifyEmail: (email, otp_code) =>
    apiCall("/auth/verify-email", "POST", { email, otp_code }),

  login: (email, password) =>
    apiCall("/auth/login", "POST", { email, password }),

  verify2FA: (email, code) =>
    apiCall("/auth/verify-2fa", "POST", { email, code }),

  getGoogleAuthUrl: () =>
    apiCall("/auth/google", "GET"),

  googleCallback: (code) =>
    apiCall("/auth/google/callback", "POST", { code }),

  googleComplete: (tempToken, phoneNumber) =>
    apiCall("/auth/oauth-complete", "POST", { temp_token: tempToken, phone_number: phoneNumber }),

  forgotPassword: (email) =>
    apiCall("/auth/forgot-password", "POST", { email }),

  resetPassword: (email, otp_code, new_password) =>
    apiCall("/auth/reset-password", "POST", { email, otp_code, new_password }),

  logout: () =>
    apiCall("/auth/logout", "POST"),
};

// Account API calls - Get user data
export const accountAPI = {
  setTransactionPin: (newPin) =>
    apiCall("/accounts/pin", "POST", { new_pin: newPin }),

  changeTransactionPin: (oldPin, newPin) =>
    apiCall("/accounts/pin/change", "POST", { old_pin: oldPin, new_pin: newPin }),

  getMe: () => apiCall("/accounts/me"),

  getAccounts: () => apiCall("/accounts/"),

  getBalance: () => apiCall("/accounts/balance"),

  getTransactions: () => apiCall("/accounts/transactions"),

  getLedger: (accountId) => apiCall(`/accounts/ledger/${accountId}`),

  searchUserByEmail: (email) => apiCall(`/accounts/search/email/${email}`),

  getRecipients: () => apiCall("/accounts/recipients"),

  addRecipient: (email) => apiCall("/accounts/recipients", "POST", { email }),
};

// Deposit API calls
export const depositAPI = {
  create: (pin, sourceCurrency, sourceAmount, bankReference, quoteId = null, paymentMethod = "CARD", depositProof = null) =>
    apiCall("/deposits/", "POST", {
      pin,
      source_currency: sourceCurrency,
      source_amount: sourceAmount,
      bank_reference: bankReference,
      quote_id: quoteId,
      payment_method: paymentMethod,
      deposit_proof: depositProof,
    }),
};

// Transfer API calls
export const transferAPI = {
  create: (pin, recipientEmail, amount, description, isTest = false) =>
    apiCall("/transfers/", "POST", {
      pin,
      recipient_email: recipientEmail,
      amount,
      description,
      is_test: isTest,
    }),
};

// Withdrawal API calls
export const withdrawAPI = {
  create: (pin, amountUsd, destinationCurrency, bankReference, quoteId = null, paymentMethod = "CARD", userPaymentDetails = null) =>
    apiCall("/withdrawals/", "POST", {
      pin,
      amount_usd: amountUsd,
      destination_currency: destinationCurrency,
      bank_reference: bankReference,
      quote_id: quoteId,
      payment_method: paymentMethod,
      user_payment_details: userPaymentDetails,
    }),
};

// FX Rate API calls
export const fxAPI = {
  getRates: () => apiCall("/fx/rates"),

  getRate: (currency) => apiCall(`/fx/rates/${currency}`),

  getQuote: (base, target, amount) =>
    apiCall(`/fx/quote?base=${base}&target=${target}&amount=${amount}`),

  refreshRates: () => apiCall("/fx/rates/refresh", "POST"),
};

// Settings API calls
export const settingsAPI = {
  getProfile: () => apiCall("/settings/profile"),

  updateProfile: (data) => apiCall("/settings/profile", "PUT", data),

  changePassword: (currentPassword, newPassword, confirmPassword) =>
    apiCall("/settings/password", "PUT", {
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),

  getNotifications: () => apiCall("/settings/notifications"),

  updateNotifications: (data) =>
    apiCall("/settings/notifications", "PUT", data),

  generate2FA: () => apiCall("/settings/2fa/generate", "POST"),

  enable2FA: (code) => apiCall("/settings/2fa/enable", "POST", { code }),

  disable2FA: (code) => apiCall("/settings/2fa/disable", "POST", { code }),

  deleteAccount: () => apiCall("/settings/account", "DELETE"),

  getBackupCodes: async () => {
    const res = await apiCall("/settings/backup-codes");
    return res.backup_codes;
  },

  generateBackupCodes: async () => {
    const res = await apiCall("/settings/backup-codes/generate", "POST");
    return res.backup_codes;
  },
};

// Card API calls
export const cardAPI = {
  list: () => apiCall("/cards/"),

  add: (cardholder_name, card_number, expiry_month, expiry_year, cvv, phone_number) =>
    apiCall("/cards/", "POST", { cardholder_name, card_number, expiry_month, expiry_year, cvv, phone_number }),

  verify: (cardId, otp_code) =>
    apiCall(`/cards/${cardId}/verify`, "POST", { otp_code }),

  resendOtp: (cardId) =>
    apiCall(`/cards/${cardId}/resend-otp`, "POST", {}),

  freeze: (cardId) =>
    apiCall(`/cards/${cardId}/freeze`, "PUT"),

  unfreeze: (cardId) =>
    apiCall(`/cards/${cardId}/unfreeze`, "PUT"),

  remove: (cardId) =>
    apiCall(`/cards/${cardId}`, "DELETE"),

  deposit: (cardId, amount_usd, pin) =>
    apiCall(`/cards/${cardId}/deposit`, "POST", { amount_usd, pin }),

  withdraw: (cardId, amount_usd, pin) =>
    apiCall(`/cards/${cardId}/withdraw`, "POST", { amount_usd, pin }),
};

// Linked Account API calls
export const linkedAccountAPI = {
  list: () => apiCall("/linked_accounts/"),
  add: (name, account_type, account_number) =>
    apiCall("/linked_accounts/", "POST", { name, account_type, account_number }),
  remove: (accountId) => apiCall(`/linked_accounts/${accountId}`, "DELETE"),
};

// Admin API calls
export const adminAPI = {
  getPendingDeposits: () => apiCall("/admin/pending-deposits"),
  getPendingWithdrawals: () => apiCall("/admin/pending-withdrawals"),
  approveDeposit: (txnId) => apiCall(`/admin/deposits/${txnId}/approve`, "POST"),
  rejectDeposit: (txnId) => apiCall(`/admin/deposits/${txnId}/reject`, "POST"),
  approveWithdrawal: (txnId) => apiCall(`/admin/withdrawals/${txnId}/approve`, "POST"),
  rejectWithdrawal: (txnId) => apiCall(`/admin/withdrawals/${txnId}/reject`, "POST"),
};

// Cashfree API calls
export const cashfreeAPI = {
  createOrder: (amount, currency, quoteId, pin) =>
    apiCall(`/cashfree/create-order?source_amount=${amount}&source_currency=${currency}&quote_id=${quoteId}&pin=${pin}`, "POST"),
  verifyOrder: (orderId) => apiCall(`/cashfree/verify-order/${orderId}`, "POST"),
  savedCards: () => apiCall("/cashfree/saved-cards"),
  deleteSavedCard: (instrumentId) => apiCall(`/cashfree/saved-cards/${instrumentId}`, "DELETE"),
};

// Health check
export const healthCheck = () => apiCall("/health");

export default apiCall;
