import { useCallback, useState } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import Header from './components/Header.jsx';
import AuthModal from './components/AuthModal.jsx';
import PasswordRecoveryModal from './components/PasswordRecoveryModal.jsx';
import HomePage from './pages/HomePage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import PlaygroundPage from './pages/PlaygroundPage.jsx';

export default function App() {
    const auth = useAuth();
    const route = useHashRoute();
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [backendDown, setBackendDown] = useState(false);
    const [recoveryDismissed, setRecoveryDismissed] = useState(false);

    const openLogin = useCallback(() => setShowAuthModal(true), []);
    const closeLogin = useCallback(() => setShowAuthModal(false), []);
    const onBackendError = useCallback(() => setBackendDown(true), []);
    const closeRecovery = useCallback(() => setRecoveryDismissed(true), []);

    if (auth.loading) {
        return <div className="loading">Loading...</div>;
    }

    return (
        <>
            {backendDown && (
                <div className="notice-banner" role="alert">
                    We're having trouble reaching the server. Some features may be unavailable right now.
                </div>
            )}

            <Header
                currentPage={route.page}
                currentUser={auth.currentUser}
                logout={auth.logout}
                onLogin={openLogin}
            />

            <main>
                {route.page === 'home' && (
                    <HomePage currentUser={auth.currentUser} onLogin={openLogin} onBackendError={onBackendError} />
                )}
                {route.page === 'projects' && (
                    <ProjectsPage
                        currentUser={auth.currentUser}
                        onLogin={openLogin}
                        selectedId={route.projectId}
                        onBackendError={onBackendError}
                    />
                )}
                {route.page === 'playground' && <PlaygroundPage />}
            </main>

            {showAuthModal && <AuthModal auth={auth} onClose={closeLogin} />}
            {auth.recovering && !recoveryDismissed && (
                <PasswordRecoveryModal auth={auth} onClose={closeRecovery} />
            )}
        </>
    );
}
