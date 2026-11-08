import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../services/api";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if redirected from Google OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      const handleGoogleCallback = async () => {
        try {
          setLoading(true);
          const response = await authAPI.googleCallback(code);
          const token = response.access_token || "auth_session_active";
          localStorage.setItem("token", token);
          if (response.email) {
            localStorage.setItem("userEmail", response.email);
          }
          window.dispatchEvent(new Event("auth-change"));
          navigate("/");
        } catch (err) {
          setError(err.message || "Google authentication failed");
        } finally {
          setLoading(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };

      handleGoogleCallback();
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = isLogin
        ? await authAPI.login(email, password)
        : await authAPI.register(email, password);

      const token = response.access_token || "auth_session_active";
      localStorage.setItem("token", token);
      localStorage.setItem("userEmail", email);
      window.dispatchEvent(new Event("auth-change"));

      navigate("/");
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await authAPI.getGoogleAuthUrl();
      window.location.href = response.auth_url;
    } catch (err) {
      setError(err.message || "Failed to initiate Google login");
    }
  };

  const handleAutofill = (testEmail) => {
    setEmail(testEmail);
    setPassword("TestPassword123!");
    setIsLogin(true);
    setError("");
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4 relative overflow-hidden">

      {/* ── Fixed-Tilted Yellow Sticky Note (No hover animations, clean & simple) ── */}
      <div className="relative mb-6 lg:mb-0 lg:fixed lg:top-8 lg:right-10 w-full max-w-xs z-30 transform rotate-3">

        {/* Simple Red Pushpin on Top Center */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center pointer-events-none">
          <div className="w-5 h-5 rounded-full bg-red-600 border border-red-800 shadow-md flex items-center justify-center relative">
            <div className="w-1.5 h-1.5 rounded-full bg-white/70 absolute top-1 left-1"></div>
          </div>
          <div className="w-2 h-1 bg-black/25 rounded-full blur-[0.5px]"></div>
        </div>

        {/* Clean Yellow Sticky Paper */}
        <div className="bg-[#fef08a] border border-[#fde047] rounded-sm shadow-[0_8px_20px_-4px_rgba(0,0,0,0.18)] p-4 text-amber-950 font-sans">

          {/* Header */}
          <div className="text-center pt-1 mb-2">
            <h3 className="font-bold text-xs uppercase tracking-wider text-amber-950">
              Sandbox Model
            </h3>
            <p className="text-[11px] text-amber-900 leading-snug mt-1">
              Simulation environment with test funds. No real money or bank charges.
            </p>
          </div>

          <div className="border-t border-amber-300/80 my-2"></div>

          {/* Test IDs */}
          <div className="space-y-2 text-xs">
            <p className="font-bold text-[11px] text-amber-950 uppercase tracking-wide">
              Test IDs:
            </p>

            {/* Sam Wilson */}
            <div className="flex items-center justify-between bg-amber-100/70 p-2.5 rounded border border-amber-300/60">
              <div className="leading-tight space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-900">Sam Wilson</span>
                  <span className="text-[9px] bg-amber-200/80 text-amber-900 px-1 py-0.2 rounded font-bold">GBP • £</span>
                </div>
                <span className="block text-[10px] text-gray-600 font-mono">sam@test.com</span>
                <span className="block text-[10px] text-gray-500 font-mono">Password: TestPassword123!</span>
                <span className="block text-[10px] text-gray-500 font-mono font-medium">PIN: 123456</span>
              </div>
              <button
                type="button"
                onClick={() => handleAutofill("sam@test.com")}
                className="text-[11px] font-bold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition-colors text-white px-2.5 py-1.5 rounded cursor-pointer shadow-xs shrink-0"
              >
                Autofill
              </button>
            </div>

            {/* Zen Tanaka */}
            <div className="flex items-center justify-between bg-amber-100/70 p-2.5 rounded border border-amber-300/60">
              <div className="leading-tight space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-900">Zen Tanaka</span>
                  <span className="text-[9px] bg-amber-200/80 text-amber-900 px-1 py-0.2 rounded font-bold">EUR • €</span>
                </div>
                <span className="block text-[10px] text-gray-600 font-mono">zen@test.com</span>
                <span className="block text-[10px] text-gray-500 font-mono">Password: TestPassword123!</span>
                <span className="block text-[10px] text-gray-500 font-mono font-medium">PIN: 123456</span>
              </div>
              <button
                type="button"
                onClick={() => handleAutofill("zen@test.com")}
                className="text-[11px] font-bold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition-colors text-white px-2.5 py-1.5 rounded cursor-pointer shadow-xs shrink-0"
              >
                Autofill
              </button>
            </div>

            {/* Davis Miller */}
            <div className="flex items-center justify-between bg-amber-100/70 p-2.5 rounded border border-amber-300/60">
              <div className="leading-tight space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-900">Davis Miller</span>
                  <span className="text-[9px] bg-amber-200/80 text-amber-900 px-1 py-0.2 rounded font-bold">USD • $</span>
                </div>
                <span className="block text-[10px] text-gray-600 font-mono">davis@test.com</span>
                <span className="block text-[10px] text-gray-500 font-mono">Password: TestPassword123!</span>
                <span className="block text-[10px] text-gray-500 font-mono font-medium">PIN: 123456</span>
              </div>
              <button
                type="button"
                onClick={() => handleAutofill("davis@test.com")}
                className="text-[11px] font-bold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition-colors text-white px-2.5 py-1.5 rounded cursor-pointer shadow-xs shrink-0"
              >
                Autofill
              </button>
            </div>


          </div>

        </div>
      </div>

      {/* ── Original Exact Centered Login Card ── */}
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">I</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">InterPay</h1>
          <p className="text-gray-600 mt-1">
            {isLogin ? "Welcome back" : "Create your account"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-600">Or continue with</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-2.5 border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </button>

        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="text-blue-600 hover:text-blue-700 font-semibold ml-1 cursor-pointer"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
