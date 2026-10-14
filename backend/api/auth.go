package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type AuthStatus struct {
	AuthRequired  bool   `json:"auth_required"`
	Authenticated bool   `json:"authenticated"`
	User          string `json:"user"`
	AuthType      string `json:"auth_type"` // "none", "forward_auth", "password"
}

func generateSessionToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// checkForwardAuthUser checks if a trusted reverse proxy (like Authentik) provided user headers.
func checkForwardAuthUser(r *http.Request) string {
	customHeader := os.Getenv("AUTH_HEADER")
	if customHeader != "" {
		if val := strings.TrimSpace(r.Header.Get(customHeader)); val != "" {
			return val
		}
	}
	// Common reverse proxy headers (Authentik, Authelia, Traefik ForwardAuth, Cloudflare, Tailscale)
	headers := []string{
		"X-authentik-username",
		"X-Authentik-Username",
		"Remote-User",
		"X-Forwarded-User",
		"X-Auth-Request-User",
		"Tailscale-User-Login",
	}
	for _, h := range headers {
		if val := strings.TrimSpace(r.Header.Get(h)); val != "" {
			return val
		}
	}
	return ""
}

// isSessionValid checks if the session token exists in auth_sessions and is not expired.
func (a *API) isSessionValid(token string) bool {
	if token == "" {
		return false
	}
	var expiresAt time.Time
	err := a.db.QueryRow("SELECT expires_at FROM auth_sessions WHERE token = ?", token).Scan(&expiresAt)
	if err != nil {
		return false
	}
	if time.Now().After(expiresAt) {
		a.db.Exec("DELETE FROM auth_sessions WHERE token = ?", token)
		return false
	}
	return true
}

func (a *API) isRequestAuthenticated(r *http.Request) (bool, string, string) {
	appPassword := os.Getenv("APP_PASSWORD")
	authHeaderReq := os.Getenv("AUTH_HEADER")

	// 1. Check for Forward Auth headers (Authentik / Authelia / Reverse Proxy)
	if user := checkForwardAuthUser(r); user != "" {
		return true, user, "forward_auth"
	}

	// If no password or auth header is configured, authentication is open
	if appPassword == "" && authHeaderReq == "" {
		return true, "anonymous", "none"
	}

	// 2. Check session cookie
	if cookie, err := r.Cookie("asdf_session"); err == nil && cookie.Value != "" {
		if a.isSessionValid(cookie.Value) {
			return true, "admin", "password"
		}
	}

	// 3. Check Bearer token in Authorization header
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if a.isSessionValid(token) {
			return true, "admin", "token"
		}
	}

	return false, "", "none"
}

func (a *API) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		appPassword := os.Getenv("APP_PASSWORD")
		authHeaderReq := os.Getenv("AUTH_HEADER")

		// If neither APP_PASSWORD nor AUTH_HEADER is set, auth is disabled
		if appPassword == "" && authHeaderReq == "" {
			next.ServeHTTP(w, r)
			return
		}

		path := r.URL.Path

		// Exempt public and auth routes
		if path == "/api/health" ||
			path == "/api/auth/status" ||
			path == "/api/auth/login" ||
			path == "/api/auth/logout" ||
			strings.HasPrefix(path, "/api/shared/") ||
			strings.HasPrefix(path, "/share/") {
			next.ServeHTTP(w, r)
			return
		}

		authenticated, _, _ := a.isRequestAuthenticated(r)
		if authenticated {
			next.ServeHTTP(w, r)
			return
		}

		// If unauthenticated and calling API:
		if strings.HasPrefix(path, "/api/") {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":         "unauthorized",
				"auth_required": true,
				"message":       "Authentication required to access this resource",
			})
			return
		}

		// For non-API routes, pass through so client can render login interface
		next.ServeHTTP(w, r)
	})
}

func (a *API) HandleAuthStatus(w http.ResponseWriter, r *http.Request) {
	appPassword := os.Getenv("APP_PASSWORD")
	authHeaderReq := os.Getenv("AUTH_HEADER")
	authRequired := appPassword != "" || authHeaderReq != ""

	authenticated, user, authType := a.isRequestAuthenticated(r)

	status := AuthStatus{
		AuthRequired:  authRequired,
		Authenticated: authenticated,
		User:          user,
		AuthType:      authType,
	}

	setJSON(w)
	json.NewEncoder(w).Encode(status)
}

func (a *API) HandleAuthLogin(w http.ResponseWriter, r *http.Request) {
	appPassword := os.Getenv("APP_PASSWORD")
	if appPassword == "" {
		setJSON(w)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Authentication is not enabled",
		})
		return
	}

	limitBody(r, maxJSONBodySize)
	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Password != appPassword {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Incorrect password",
		})
		return
	}

	token := generateSessionToken()
	expiresAt := time.Now().Add(30 * 24 * time.Hour) // 30 day session

	_, err := a.db.Exec("INSERT INTO auth_sessions (token, created_at, expires_at) VALUES (?, CURRENT_TIMESTAMP, ?)", token, expiresAt)
	if err != nil {
		log.Printf("HandleAuthLogin DB error: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "asdf_session",
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"token":   token,
	})
}

func (a *API) HandleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("asdf_session"); err == nil && cookie.Value != "" {
		a.db.Exec("DELETE FROM auth_sessions WHERE token = ?", cookie.Value)
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "asdf_session",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	setJSON(w)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}
