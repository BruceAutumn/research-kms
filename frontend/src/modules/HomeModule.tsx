import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  FileText,
  FolderTree,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Upload,
  Clock,
  Star,
  Hash
} from 'lucide-react';
import { listPapers, listNotes, listAgents, getSystemAbout, semanticSearch } from '../api/client';
import type { Paper, Note, Agent, SystemAbout } from '../types';
import { useShell } from '../shell/ShellContext';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'late night';
  if (hour < 12) return 'Good morning';
  if (hour < 14) return 'ingood noon';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  if (diffHour < 24) return `${diffHour} Smallwhen before`;
  if (diffDay < 30) return `${diffDay} days ago`;
  return date.toLocaleDateString();
}

export default function HomeModule() {
  const navigate = useNavigate();
  const { openPalette } = useShell();

  const aboutQuery = useQuery<SystemAbout>({ queryKey: ['system-about'], queryFn: getSystemAbout });
  const papersQuery = useQuery<Paper[]>({
    queryKey: ['papers', 'recent'],
    queryFn: () => listPapers('', '', 'recent'),
    select: (data) => data.slice(0, 6)
  });
  const notesQuery = useQuery<Note[]>({
    queryKey: ['notes', 'recent'],
    queryFn: () => listNotes(''),
    select: (data) => data.slice(0, 5)
  });
  const agentsQuery = useQuery<Agent[]>({
    queryKey: ['agents', 'list'],
    queryFn: listAgents,
    select: (data) => data.slice(0, 4)
  });

  const stats = useQuery({
    queryKey: ['papers', 'all-stats'],
    queryFn: () => listPapers(),
    select: (all) => ({
      total: all.length,
      unread: all.filter((p) => !p.readStatus || p.readStatus === 'unread').length,
      reading: all.filter((p) => p.readStatus === 'reading').length,
      done: all.filter((p) => p.readStatus === 'done').length,
      favorite: all.filter((p) => p.favorite).length,
      withPdf: all.filter((p) => p.pdfPath).length
    })
  });

  const recentPapers = papersQuery.data || [];
  const recentNotes = notesQuery.data || [];
  const agents = agentsQuery.data || [];
  const s = stats.data;

  return (
    <div className="home-root">
      <div className="home-content">
        <section className="home-hero">
          <h1 className="home-greeting">{getGreeting()}</h1>
          <p className="home-subtitle">Your AI-native Research Knowledge Workbench</p>
          <div className="home-quick-actions">
            <button type="button" className="home-qa-btn primary" onClick={() => navigate('/literature')}>
              <Upload size={16} aria-hidden="true" />
              <span>importPaper</span>
            </button>
            <button type="button" className="home-qa-btn" onClick={() => navigate('/ai')}>
              <Sparkles size={16} aria-hidden="true" />
              <span>ask AI</span>
            </button>
            <button type="button" className="home-qa-btn" onClick={openPalette}>
              <Search size={16} aria-hidden="true" />
              <span>Global Search</span>
            </button>
          </div>
        </section>

        <section className="home-stats">
          <div className="home-stat-card">
            <BookOpen size={18} className="home-stat-icon" aria-hidden="true" />
            <div className="home-stat-body">
              <span className="home-stat-num">{s?.total ?? '--'}</span>
              <span className="home-stat-label">Paper Count</span>
            </div>
          </div>
          <div className="home-stat-card">
            <FileText size={18} className="home-stat-icon" aria-hidden="true" />
            <div className="home-stat-body">
              <span className="home-stat-num">{s?.withPdf ?? '--'}</span>
              <span className="home-stat-label">has PDF</span>
            </div>
          </div>
          <div className="home-stat-card">
            <Clock size={18} className="home-stat-icon" aria-hidden="true" />
            <div className="home-stat-body">
              <span className="home-stat-num">{s?.reading ?? '--'}</span>
              <span className="home-stat-label">Reading</span>
            </div>
          </div>
          <div className="home-stat-card">
            <Star size={18} className="home-stat-icon" aria-hidden="true" />
            <div className="home-stat-body">
              <span className="home-stat-num">{s?.favorite ?? '--'}</span>
              <span className="home-stat-label">Favorited</span>
            </div>
          </div>
          <div className="home-stat-card">
            <FolderTree size={18} className="home-stat-icon" aria-hidden="true" />
            <div className="home-stat-body">
              <span className="home-stat-num">{recentNotes.length}</span>
              <span className="home-stat-label">Recent Notes</span>
            </div>
          </div>
          <div className="home-stat-card">
            <Bot size={18} className="home-stat-icon" aria-hidden="true" />
            <div className="home-stat-body">
              <span className="home-stat-num">{agents.length}</span>
              <span className="home-stat-label">AI Agent</span>
            </div>
          </div>
        </section>

        <div className="home-grid">
          <section className="home-panel">
            <div className="home-panel-header">
              <h2>Recent Papers</h2>
              <button type="button" className="home-link" onClick={() => navigate('/literature')}>
                View All ->
              </button>
            </div>
            <div className="home-panel-body">
              {papersQuery.isLoading && <div className="home-empty">Loading...</div>}
              {!papersQuery.isLoading && recentPapers.length === 0 && (
                <div className="home-empty">
                  <p>No papers yet</p>
                  <button type="button" className="btn btn-primary" onClick={() => navigate('/literature')}>
                    <Plus size={14} /> import firstOnepaper
                  </button>
                </div>
              )}
              {recentPapers.map((paper) => (
                <button
                  key={paper.id}
                  type="button"
                  className="home-paper-row"
                  onClick={() => navigate('/literature')}
                  title={paper.title}
                >
                  <div className="home-paper-info">
                    <span className="home-paper-title">{paper.title}</span>
                    <span className="home-paper-meta">
                      {paper.authors ? paper.authors.split(',')[0] : '--'}
                      {paper.year ? ` . ${paper.year}` : ''}
                      {paper.journal ? ` . ${paper.journal}` : ''}
                    </span>
                  </div>
                  <div className="home-paper-tags">
                    {(paper.tags || []).slice(0, 2).map((tag) => (
                      <span key={tag} className="home-tag">{tag}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="home-panel">
            <div className="home-panel-header">
              <h2>Recent Notes</h2>
              <button type="button" className="home-link" onClick={() => navigate('/vault')}>
                View All ->
              </button>
            </div>
            <div className="home-panel-body">
              {notesQuery.isLoading && <div className="home-empty">Loading...</div>}
              {!notesQuery.isLoading && recentNotes.length === 0 && (
                <div className="home-empty">
                  <p>not yetNote</p>
                  <button type="button" className="btn btn-primary" onClick={() => navigate('/vault')}>
                    <Plus size={14} /> New Note
                  </button>
                </div>
              )}
              {recentNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  className="home-note-row"
                  onClick={() => navigate('/vault')}
                  title={note.title}
                >
                  <FileText size={14} className="home-note-icon" aria-hidden="true" />
                  <div className="home-note-info">
                    <span className="home-note-title">{note.title}</span>
                    <span className="home-note-time">{formatTimeAgo(note.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="home-ai-section">
          <div className="home-panel-header">
            <h2>
              <Sparkles size={16} aria-hidden="true" />
              AI Assistant
            </h2>
            <button type="button" className="home-link" onClick={() => navigate('/ai')}>
              open AI Studio ->
            </button>
          </div>
          <div className="home-ai-grid">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className="home-agent-card"
                onClick={() => navigate('/ai')}
              >
                <Bot size={20} className="home-agent-icon" aria-hidden="true" />
                <div className="home-agent-body">
                  <span className="home-agent-name">{agent.name}</span>
                  <span className="home-agent-desc">{agent.description || 'AI Research Assistant'}</span>
                </div>
              </button>
            ))}
            {agents.length === 0 && !agentsQuery.isLoading && (
              <div className="home-empty">
                <p>not yetConfig AI Agent</p>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/ai')}>
                  <Plus size={14} /> Create Agent
                </button>
              </div>
            )}
          </div>
        </section>

        <footer className="home-footer">
          <span>Research KMS</span>
          {aboutQuery.data && (
            <span className="home-version">v{aboutQuery.data.version} . Flyway V{aboutQuery.data.flywayVersion}</span>
          )}
        </footer>
      </div>
    </div>
  );
}