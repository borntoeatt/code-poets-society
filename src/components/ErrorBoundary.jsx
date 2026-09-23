import React from 'react';

export default class ErrorBoundary extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error('React error:', error, info);
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <div className="error-screen">
                <h1>Something went wrong</h1>
                <p>An unexpected error occurred. Please refresh the page.</p>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                    Refresh Page
                </button>
            </div>
        );
    }
}
