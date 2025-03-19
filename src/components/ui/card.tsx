import React from 'react';

export function Card({ children, className = '', ...props }: any) {
  return (
    <div
      className={`rounded-md border shadow-md bg-white ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className = '', ...props }: any) {
  return (
    <div className={`p-2 ${className}`} {...props}>
      {children}
    </div>
  );
}
