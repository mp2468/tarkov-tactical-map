import React from 'react';
import './App.css'; // Import our Tailwind (and custom) CSS
import RealTimeMapCommunication from './RealTimeMapCommunication'

function App() {
  return (
    <div className="bg-gray-50 text-gray-800 min-h-screen">
      <RealTimeMapCommunication />
    </div>
  );
}

export default App;
