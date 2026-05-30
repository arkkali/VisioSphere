import React, { useState, useRef, useEffect } from 'react';

const TagInput = ({ tags, onChange, suggestions, isDark }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (index) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', maxWidth: 600 }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '4px',
          padding: '6px 10px',
          minHeight: '42px',
          borderRadius: '8px',
          border: `1px solid ${focused ? '#00a8e8' : isDark ? '#334155' : '#cbd5e1'}`,
          backgroundColor: isDark ? '#0f172a' : '#f8fafc',
          cursor: 'text',
          boxSizing: 'border-box',
          outline: focused ? '1px solid #00a8e8' : 'none',
          transition: 'border-color 0.2s, outline 0.2s',
        }}
      >
        {tags.map((tag, index) => (
          <span
            key={index}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 4px 2px 10px',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              lineHeight: '1.6',
              fontFamily: "'Outfit', sans-serif",
              backgroundColor: isDark ? '#0c4a6e' : '#e0f2fe',
              color: isDark ? '#e0f8ff' : '#0369a1',
              border: `1px solid ${isDark ? '#0ea5e9' : '#bae6fd'}`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: isDark ? '#e0f8ff' : '#0369a1', fontWeight: 700 }}>{tag}</span>
            <span
              onClick={(e) => { e.stopPropagation(); removeTag(index); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '1.1rem',
                lineHeight: 1,
                color: isDark ? '#7dd3fc' : '#94a3b8',
                padding: '0 2px',
                borderRadius: '50%',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = isDark ? '#f87171' : '#dc2626'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = isDark ? '#7dd3fc' : '#94a3b8'; }}
            >
              ×
            </span>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowSuggestions(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { setFocused(true); setShowSuggestions(true); }}
          placeholder={tags.length === 0 ? '+ Add tags (e.g. Fall Incident, Vitals)...' : ''}
          style={{
            flex: 1,
            minWidth: '140px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '0.875rem',
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 500,
            color: isDark ? '#ffffff' : '#0f172a',
            padding: '2px 4px',
          }}
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            borderRadius: '10px',
            overflow: 'hidden',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.1)',
            padding: '4px',
          }}
        >
          {filteredSuggestions.map((suggestion) => (
            <div
              key={suggestion}
              onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: 600,
                fontFamily: "'Outfit', sans-serif",
                color: isDark ? '#e2e8f0' : '#0f172a',
                marginBottom: '2px',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = isDark ? '#334155' : '#f1f5f9'; e.currentTarget.style.color = isDark ? '#ffffff' : '#00212e'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = isDark ? '#e2e8f0' : '#0f172a'; }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TagInput;    