import React from 'react';

export function Button({ children, className = '', ...props }) {
  return (
    <button
      className={`rounded-md border px-2 py-1 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
