import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export function Header() {
  const [refreshing, setRefreshing] = useState(false);
  const reduced = useReducedMotion();

  const handleRefresh = () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('ultimate:refresh'));
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo">
          <span className="logo-icon">📺</span>
          <span className="logo-text">Ultimate UI</span>
        </Link>
        <div className="header-actions">
          <motion.button
            className="btn-refresh"
            onClick={handleRefresh}
            title="Aktualisieren"
            aria-label="Aktualisieren"
            animate={reduced ? {} : { rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          >
            🔄
          </motion.button>
          <span className="status-indicator" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}
