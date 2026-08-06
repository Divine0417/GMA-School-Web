import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from '../components/Icon';

const DialogContext = createContext();

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

// Replaces window.confirm/window.alert/window.prompt with a styled modal
// matching the rest of the admin console, since native browser dialogs
// look/feel inconsistent and can't be restyled. confirmDialog resolves
// true/false; alertDialog resolves once dismissed; promptDialog resolves the
// typed text, or null if cancelled.
export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const resolveRef = useRef(null);

  const confirmDialog = useCallback((message, { title = 'Are you sure?', confirmLabel = 'Confirm', danger = true } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'confirm', title, message, confirmLabel, danger });
    });
  }, []);

  const alertDialog = useCallback((message, { title = 'Notice' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'alert', title, message });
    });
  }, []);

  const promptDialog = useCallback((message, { title = 'One more thing', confirmLabel = 'Submit', placeholder = '', defaultValue = '' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setPromptValue(defaultValue);
      setDialog({ type: 'prompt', title, message, confirmLabel, placeholder });
    });
  }, []);

  const handleClose = (result) => {
    setDialog(null);
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
  };

  return (
    <DialogContext.Provider value={{ confirmDialog, alertDialog, promptDialog }}>
      {children}

      {dialog && (
        <div className="modal-backdrop" onClick={() => handleClose(dialog.type === 'alert' ? undefined : (dialog.type === 'prompt' ? null : false))}>
          <div className="modal-panel dialog-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{dialog.title}</h2>
              <button className="modal-close-btn" onClick={() => handleClose(dialog.type === 'alert' ? undefined : (dialog.type === 'prompt' ? null : false))}>
                <Icon name="close" size={22} />
              </button>
            </div>
            <p style={{ marginBottom: dialog.type === 'prompt' ? 'var(--space-3)' : 'var(--space-6)' }}>{dialog.message}</p>
            {dialog.type === 'prompt' && (
              <textarea
                className="form-input"
                rows={3}
                autoFocus
                placeholder={dialog.placeholder}
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                style={{ width: '100%', marginBottom: 'var(--space-6)', resize: 'vertical' }}
              />
            )}
            <div className="dialog-actions">
              {dialog.type !== 'alert' && (
                <button className="btn btn-outline" onClick={() => handleClose(dialog.type === 'prompt' ? null : false)}>Cancel</button>
              )}
              <button
                className={dialog.type === 'confirm' && dialog.danger ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => handleClose(dialog.type === 'confirm' ? true : (dialog.type === 'prompt' ? promptValue : undefined))}
              >
                {dialog.type === 'alert' ? 'OK' : dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
