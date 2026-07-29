import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import SVGIcon from '../components/icons/SVGIcon';

const DialogContext = createContext();

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

// Replaces window.confirm/window.alert with a styled modal matching the rest
// of the site, since native browser dialogs look/feel inconsistent and can't
// be restyled. confirmDialog resolves true/false; alertDialog resolves once dismissed.
export const DialogProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const confirmDialog = useCallback((message, { title = 'Are you sure?', confirmLabel = 'Confirm' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'confirm', title, message, confirmLabel });
    });
  }, []);

  const alertDialog = useCallback((message, { title = 'Notice' } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ type: 'alert', title, message });
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
    <DialogContext.Provider value={{ confirmDialog, alertDialog }}>
      {children}

      {dialog && (
        <div className="dialog-backdrop" onClick={() => handleClose(dialog.type === 'confirm' ? false : undefined)}>
          <div className="dialog-panel" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>{dialog.title}</h3>
              <button className="dialog-close-btn" onClick={() => handleClose(dialog.type === 'confirm' ? false : undefined)} aria-label="Close">
                <SVGIcon name="close" size="20" />
              </button>
            </div>
            <p className="dialog-message">{dialog.message}</p>
            <div className="dialog-actions">
              {dialog.type === 'confirm' && (
                <button className="btn btn-outline btn-sm" onClick={() => handleClose(false)}>Cancel</button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => handleClose(dialog.type === 'confirm' ? true : undefined)}>
                {dialog.type === 'confirm' ? dialog.confirmLabel : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
};
