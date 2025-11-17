import { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate, Link } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import "./../styles/Login.css";


export default function Login() {
    const navigate = useNavigate();
    const online = useOnlineStatus();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMsg("");

        const normalizedEmail = email.trim().toLowerCase();
        const OFFLINE_USERS_KEY = "offlineUsers";

        if (!normalizedEmail || !password) {
            setErrorMsg("Ingresa tu correo y contraseña.");
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            setErrorMsg("Ingresa un correo válido.");
            return;
        }

        if (password.length < 6) {
            setErrorMsg("La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        setLoading(true);

        const tryOfflineLogin = () => {
            const hasLoggedInOnline = localStorage.getItem("hasLoggedInOnline");
            const offlineUsersRaw = localStorage.getItem(OFFLINE_USERS_KEY);

            if (!offlineUsersRaw || hasLoggedInOnline !== "true") {
                throw new Error(
                    "Modo offline disponible solo si ya iniciaste sesión antes con internet en este dispositivo."
                );
            }

            let offlineUsers = [];
            try {
                offlineUsers = JSON.parse(offlineUsersRaw);
            } catch {
                offlineUsers = [];
            }

            const offlineCreds = offlineUsers.find(
                (u) =>
                    (u.email || "").toLowerCase() === normalizedEmail &&
                    u.password === password
            );

            if (!offlineCreds) {
                throw new Error("Correo o contraseña incorrectos para modo offline.");
            }

            if (!offlineCreds.rol) {
                throw new Error(
                    "Faltan datos locales del usuario. Inicia sesión nuevamente cuando tengas internet."
                );
            }

            const offlineUser = {
                id: offlineCreds.id || null,
                email: offlineCreds.email,
                nombre: offlineCreds.nombre || "",
                rol: offlineCreds.rol || "paciente",
                tabla:
                    offlineCreds.tabla ||
                    (offlineCreds.rol === "paciente" ? "pacientes" : "psicologos"),
            };

            localStorage.setItem("userLogged", JSON.stringify(offlineUser));

            if (offlineUser.rol === "paciente") {
                localStorage.setItem("pacienteLocal", JSON.stringify(offlineUser));
                navigate("/paciente");
            } else {
                localStorage.setItem("psicologoLocal", JSON.stringify(offlineUser));
                navigate("/psicologo");
            }
        };

        try {
            if (!online) {
                tryOfflineLogin();
                return;
            }

            let data;

            try {
                const res = await supabase.auth.signInWithPassword({
                    email: normalizedEmail,
                    password,
                });

                if (res.error) throw res.error;
                data = res.data;
            } catch (err) {
                const msgLow = (err.message || "").toLowerCase();

                if (
                    msgLow.includes("failed to fetch") ||
                    msgLow.includes("network") ||
                    err.name === "AuthRetryableFetchError"
                ) {
                    console.warn("Fallo Supabase por red. Probando modo offline...");
                    tryOfflineLogin();
                    return;
                }

                throw err;
            }

            const user = data.user;
            if (!user) throw new Error("No se pudo obtener el usuario.");

            const rol = user.user_metadata?.rol || "paciente";
            const tablaDestino = rol === "paciente" ? "pacientes" : "psicologos";

            const { data: perfiles, error: errorPerfilSelect } = await supabase
                .from(tablaDestino)
                .select("id")
                .eq("id", user.id)
                .limit(1);

            if (errorPerfilSelect) {
                console.error("ERROR SELECT PERFIL:", errorPerfilSelect);
            }

            if (!perfiles || perfiles.length === 0) {
                const { error: errorInsertPerfil } = await supabase
                    .from(tablaDestino)
                    .insert({
                        id: user.id,
                        email: user.email,
                        nombre: user.user_metadata?.nombre || "",
                    });

                if (errorInsertPerfil) {
                    console.error("ERROR INSERT PERFIL:", errorInsertPerfil);
                }
            }

            const userLogged = {
                id: user.id,
                email: user.email.toLowerCase(),
                nombre: user.user_metadata?.nombre || "",
                rol,
                tabla: tablaDestino,
            };

            localStorage.setItem("userLogged", JSON.stringify(userLogged));

            let offlineUsers = [];
            const existingRaw = localStorage.getItem(OFFLINE_USERS_KEY);
            if (existingRaw) {
                try {
                    offlineUsers = JSON.parse(existingRaw);
                } catch {
                    offlineUsers = [];
                }
            }

            const idx = offlineUsers.findIndex(
                (u) => (u.email || "").toLowerCase() === normalizedEmail
            );

            const offlineUserData = {
                id: userLogged.id,
                email: normalizedEmail,
                password,
                nombre: userLogged.nombre,
                rol: userLogged.rol,
                tabla: tablaDestino,
            };

            if (idx >= 0) {
                offlineUsers[idx] = offlineUserData;
            } else {
                offlineUsers.push(offlineUserData);
            }

            localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(offlineUsers));
            localStorage.setItem("hasLoggedInOnline", "true");

            if (rol === "paciente") {
                localStorage.setItem("pacienteLocal", JSON.stringify(userLogged));
                navigate("/paciente");
            } else {
                localStorage.setItem("psicologoLocal", JSON.stringify(userLogged));
                navigate("/psicologo");
            }
        } catch (err) {
            console.error("ERROR LOGIN:", err);
            let msg = err.message || "Error al iniciar sesión";

            const lower = msg.toLowerCase();

            if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
                msg = "Correo o contraseña incorrectos.";
            } else if (lower.includes("email not confirmed") || lower.includes("not allowed")) {
                msg =
                    "Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja y carpeta de spam.";
            } else if (lower.includes("network") || lower.includes("fetch")) {
                msg = "Problema de conexión con el servidor. Verifica tu internet.";
            } else if (lower.includes("rate limit")) {
                msg = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
            }

            setErrorMsg(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-card">
                {/* Header */}
                <div className="auth-header">
                    <h2>Login</h2>

                    <span className={`status-pill ${online ? "online" : "offline"}`}>
                        ● {online ? "Online" : "Offline"}
                    </span>
                </div>

                {!online && (
                    <p className="offline-hint">
                        Modo offline: solo cuentas que ya iniciaron sesión en este dispositivo.
                    </p>
                )}

                <form onSubmit={handleLogin}>
                    <div className="field">
                        <label>Correo</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                    </div>

                    <div className="field">
                        <label>Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            minLength={6}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {errorMsg && <p className="error-msg">{errorMsg}</p>}

                    <button type="submit" disabled={loading} className="auth-button">
                        {loading ? "Ingresando..." : "Iniciar sesión"}
                    </button>
                </form>

                <p className="auth-footer">
                    ¿No tienes cuenta?{" "}
                    <Link to="/register" className="auth-link">
                        Regístrate
                    </Link>
                </p>
            </div>
        </div>
    );


}
