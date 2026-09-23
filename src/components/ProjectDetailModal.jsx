import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { supabase, friendlyError } from '../lib/supabase.js';
import { formatRelativeDate, safeHttpUrl } from '../lib/utils.js';
import { LIMITS } from '../config.js';

const COMMENT_SELECT = '*, profiles!comments_author_id_fkey(username)';
const PAGE = 5;

export default function ProjectDetailModal({ project, onClose, currentUser, onLogin }) {
    const [comments, setComments] = useState([]);
    const [commentsLoading, setCommentsLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [posting, setPosting] = useState(false);
    const [commentError, setCommentError] = useState('');
    const [visible, setVisible] = useState(PAGE);
    const [editing, setEditing] = useState(null);
    const [editContent, setEditContent] = useState('');
    const [reported, setReported] = useState(() => new Set());

    const isCommunity = project.isSupabase;

    const loadComments = useCallback(async () => {
        const { data, error } = await supabase
            .from('comments')
            .select(COMMENT_SELECT)
            .eq('project_id', project.id)
            .order('created_at', { ascending: false });
        if (error) {
            console.error('Failed to load comments:', error);
            setCommentError(friendlyError(error, 'Could not load comments.'));
        } else {
            setComments(data || []);
        }
        setCommentsLoading(false);
    }, [project.id]);

    useEffect(() => {
        if (isCommunity) loadComments();
        else setCommentsLoading(false);
    }, [isCommunity, loadComments]);

    const requireLogin = () => {
        if (currentUser) return true;
        onLogin();
        return false;
    };

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!requireLogin()) return;
        const content = newComment.trim();
        if (!content) return;

        setPosting(true);
        setCommentError('');
        const { data, error } = await supabase
            .from('comments')
            .insert([{ project_id: project.id, author_id: currentUser.id, content }])
            .select(COMMENT_SELECT);
        setPosting(false);

        if (error) {
            console.error('Failed to add comment:', error);
            setCommentError(friendlyError(error, 'Failed to add comment. Please try again.'));
            return;
        }
        if (data?.[0]) {
            setComments((prev) => [data[0], ...prev]);
            setNewComment('');
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (!window.confirm('Delete this comment?')) return;
        const { error } = await supabase.from('comments').delete().eq('id', commentId);
        if (error) {
            console.error('Failed to delete comment:', error);
            setCommentError(friendlyError(error, 'Failed to delete comment. Please try again.'));
            return;
        }
        setComments((prev) => prev.filter((c) => c.id !== commentId));
    };

    const handleEditComment = async (commentId) => {
        const content = editContent.trim();
        if (!content) return;
        const { error } = await supabase.from('comments').update({ content }).eq('id', commentId);
        if (error) {
            console.error('Failed to edit comment:', error);
            setCommentError(friendlyError(error, 'Failed to edit comment. Please try again.'));
            return;
        }
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, content } : c)));
        setEditing(null);
        setEditContent('');
    };

    const handleReportComment = async (commentId) => {
        if (!requireLogin() || reported.has(commentId)) return;
        const { error } = await supabase
            .from('comment_reports')
            .insert([{ comment_id: commentId, reporter_id: currentUser.id, reason: 'Reported by user' }]);
        if (error && error.code !== '23505') {
            console.error('Failed to report comment:', error);
            setCommentError(friendlyError(error, 'Failed to report comment. Please try again.'));
            return;
        }
        setReported((prev) => new Set([...prev, commentId]));
    };

    const githubUrl = safeHttpUrl(project.githubUrl);
    const demoUrl = safeHttpUrl(project.demoUrl);

    return (
        <Modal title={project.title} titleId="project-detail-title" onClose={onClose} maxWidth="800px">
            <div className="project-detail-meta">
                <span className="meta-text">by {project.author}</span>
                {project.language && <span className="project-tag">{project.language}</span>}
                <span className="meta-text">⭐ {project.stars || 0} stars</span>
                {project.isGithub && <span className="meta-text">• GitHub</span>}
                {isCommunity && <span className="meta-text">• Community</span>}
            </div>

            <div style={{ fontSize: '1rem', lineHeight: 1.7, marginBottom: '1.5rem', whiteSpace: 'pre-wrap' }}>
                {project.description || 'No description provided.'}
            </div>

            {project.tech_stack?.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.8rem' }}>Tech Stack:</div>
                    <div className="project-tech-stack">
                        {project.tech_stack.map((tech) => (
                            <span key={tech} className="tech-tag">{tech}</span>
                        ))}
                    </div>
                </div>
            )}

            {(githubUrl || demoUrl) && (
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                    {githubUrl && (
                        <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                            View on GitHub →
                        </a>
                    )}
                    {demoUrl && (
                        <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                            Live Demo →
                        </a>
                    )}
                </div>
            )}

            {isCommunity && (
                <section className="comments-section" aria-label="Comments">
                    <div className="comments-title">💬 Comments ({comments.length})</div>

                    {commentError && <div className="form-error" role="alert">{commentError}</div>}

                    {commentsLoading ? (
                        <div className="comments-empty">Loading comments...</div>
                    ) : comments.length === 0 ? (
                        <div className="comments-empty">No comments yet. Be the first to comment!</div>
                    ) : (
                        <div className="comments-list">
                            {comments.slice(0, visible).map((comment) => {
                                const mine = currentUser?.id === comment.author_id;
                                return (
                                    <div key={comment.id} className="comment-item">
                                        <div className="comment-header">
                                            <div>
                                                <span className="comment-author">{comment.profiles?.username || 'Anonymous'}</span>
                                                <span className="comment-date"> • {formatRelativeDate(comment.created_at)}</span>
                                            </div>
                                            <div className="comment-actions">
                                                {mine && (
                                                    <>
                                                        <button
                                                            className="comment-delete-btn"
                                                            style={{ color: 'var(--code-green)' }}
                                                            onClick={() => { setEditing(comment.id); setEditContent(comment.content); }}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button className="comment-delete-btn" onClick={() => handleDeleteComment(comment.id)}>
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                                {currentUser && !mine && (
                                                    <button
                                                        className="comment-delete-btn"
                                                        style={{ color: reported.has(comment.id) ? 'var(--text-secondary)' : 'var(--error)' }}
                                                        onClick={() => handleReportComment(comment.id)}
                                                        disabled={reported.has(comment.id)}
                                                    >
                                                        {reported.has(comment.id) ? 'Reported' : 'Report'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {editing === comment.id ? (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <textarea
                                                    className="comment-edit-textarea"
                                                    value={editContent}
                                                    onChange={(e) => setEditContent(e.target.value)}
                                                    maxLength={LIMITS.commentMax}
                                                    aria-label="Edit comment"
                                                />
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                    <button className="btn btn-primary btn-small" onClick={() => handleEditComment(comment.id)}>Save</button>
                                                    <button className="btn btn-small" onClick={() => { setEditing(null); setEditContent(''); }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="comment-content">{comment.content}</div>
                                        )}
                                    </div>
                                );
                            })}
                            {comments.length > visible && (
                                <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                                    <button className="btn btn-secondary btn-small" onClick={() => setVisible((v) => v + PAGE)}>
                                        Load More Comments ({comments.length - visible} remaining)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {currentUser ? (
                        <form className="comment-form" onSubmit={handleAddComment}>
                            <label htmlFor="new-comment" className="visually-hidden">Add a comment</label>
                            <textarea
                                id="new-comment"
                                className="comment-textarea"
                                placeholder="Add a comment..."
                                value={newComment}
                                onChange={(e) => { setNewComment(e.target.value); setCommentError(''); }}
                                maxLength={LIMITS.commentMax}
                                required
                            />
                            <div className="comment-form-actions">
                                <button type="submit" className="btn btn-primary btn-small" disabled={posting || !newComment.trim()}>
                                    {posting ? 'Posting...' : 'Post Comment'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="comment-login-prompt">
                            <p style={{ marginBottom: '0.5rem' }}>Sign in to leave a comment</p>
                            {/* Opens the auth modal on top; after login the comment form appears here. */}
                            <button className="btn btn-primary btn-small" onClick={onLogin}>
                                Sign In
                            </button>
                        </div>
                    )}
                </section>
            )}
        </Modal>
    );
}
