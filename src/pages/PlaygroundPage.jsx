import { useEffect, useState } from 'react';

const DEFAULT_CODE = `<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: 'Space Mono', monospace;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
        }
        .card {
            background: white;
            padding: 3rem;
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        }
        h1 {
            color: #667eea;
            margin: 0 0 1rem 0;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>Welcome to the Playground!</h1>
        <p>Edit the code to see changes in real-time.</p>
        <button onclick="alert('Hello, Code Poet!')">Click Me</button>
    </div>
</body>
</html>`;

export default function PlaygroundPage() {
    const [code, setCode] = useState(DEFAULT_CODE);
    const [preview, setPreview] = useState(DEFAULT_CODE);

    useEffect(() => {
        const timer = setTimeout(() => setPreview(code), 500);
        return () => clearTimeout(timer);
    }, [code]);

    return (
        <div className="container">
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <h1 className="card-title" style={{ margin: 0 }}>Code Playground</h1>
                <button className="btn btn-secondary btn-small" onClick={() => setCode(DEFAULT_CODE)}>
                    Reset Code
                </button>
            </div>

            <div className="playground">
                <div className="playground-editor">
                    <div className="playground-toolbar">
                        <span>HTML Editor</span>
                        <span>Live Preview →</span>
                    </div>
                    <textarea
                        className="playground-textarea"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        spellCheck={false}
                        aria-label="HTML editor"
                    />
                </div>

                <div className="playground-preview">
                    {/* No allow-same-origin: user code cannot touch this page's session. */}
                    <iframe srcDoc={preview} title="Live preview" sandbox="allow-scripts allow-modals" />
                </div>
            </div>
        </div>
    );
}
