import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

// We assume some websocket server or library is available.
// In a real-world scenario, you would replace 'wss://example.com/socket' with your actual endpoint.
// For demonstration, this code simulates a WebSocket connection and displays debug data.

// Distinct colors pool.
const PRESET_COLORS = [
  '#FF0000', // red
  '#00FF00', // lime
  '#0000FF', // blue
  '#FFFF00', // yellow
  '#FFA500', // orange
  '#800080', // purple
  '#008080', // teal
  '#FF00FF', // magenta
  '#00FFFF', // cyan
  '#808000', // olive
];

const RealTimeMapCommunication = () => {
  // App states
  const [username, setUsername] = useState('');
  const [myColor, setMyColor] = useState('');
  const [availableColors, setAvailableColors] = useState(PRESET_COLORS);
  const [connectedUsers, setConnectedUsers] = useState([]); // e.g. [ { id: 'some-id', name: 'user1', color: '#FF0000' }, ...]
  const [selectedTool, setSelectedTool] = useState('freeform'); // 'freeform' | 'circle' | 'arrow'
  const [thickness, setThickness] = useState(2);

  // Map background
  const [mapSrc, setMapSrc] = useState('https://via.placeholder.com/1920x1080?text=Placeholder+Map');

  // We store drawn shapes in local state for demonstration.
  // Each shape might be an object: { id, type, color, thickness, pathData/circleData/arrowData }
  const [shapes, setShapes] = useState([]);
  // We keep a local debug log.
  const [debugLog, setDebugLog] = useState([]);

  // Collapsible overlays
  const [showControls, setShowControls] = useState(true);
  const [showUserList, setShowUserList] = useState(true);
  const [showDebug, setShowDebug] = useState(true);

  const mapRef = useRef(null);
  const drawingRef = useRef({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentPath: [],
  });

  // Simulate a WebSocket connection.
  // In a real app, you'd connect to your backend with an actual WebSocket.
  useEffect(() => {
    // Let user pick random username if none
    if (!username) {
      setUsername('User_' + Math.floor(Math.random() * 1000));
    }

    // Attempt to pick a free color
    if (!myColor) {
      // pick the first color from availableColors
      if (availableColors.length > 0) {
        const chosen = availableColors[0];
        setMyColor(chosen);
        setAvailableColors((prev) => prev.filter((c) => c !== chosen));
      }
    }

    // On mount, pretend we connected to a WebSocket.
    const userData = {
      id: Math.random().toString(36).slice(2),
      name: username || 'UnnamedUser',
      color: myColor || '#000000',
    };
    const newUser = { ...userData };
    setConnectedUsers((prev) => [...prev, newUser]);

    // Cleanup: when user leaves, remove from connectedUsers.
    return () => {
      setConnectedUsers((prev) => prev.filter((u) => u.id !== userData.id));
    };
  }, [username, myColor, availableColors]);

  // Helper to push debug messages.
  const addDebugLog = (msg) => {
    setDebugLog((prev) => [msg, ...prev]);
  };

  // Function to broadcast shape data.
  const broadcastShape = (action, shapeData) => {
    // shapeData is an object describing what was drawn or removed.
    // 'action' could be 'draw' or 'undo'.
    const message = {
      action,
      shapeData,
      user: { name: username, color: myColor },
    };

    // In a real app, you'd do: socket.send(JSON.stringify(message));
    // For now, we just push to debug log and update local shapes.
    addDebugLog(`Broadcast: ${JSON.stringify(message)}`);

    if (action === 'draw') {
      setShapes((prev) => [...prev, shapeData]);
    } else if (action === 'undo') {
      // remove shape if it is the last shape from this user.
      setShapes((prev) => {
        // find the last shape from me.
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].userColor === myColor && prev[i].userName === username) {
            return prev.slice(0, i).concat(prev.slice(i + 1));
          }
        }
        return prev;
      });
    }
  };

  // Upload new map.
  const handleUploadMap = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setMapSrc(event.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle drawing on the map.
  const handlePointerDown = (e) => {
    e.preventDefault();
    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawingRef.current.isDrawing = true;
    drawingRef.current.startX = x;
    drawingRef.current.startY = y;
    drawingRef.current.currentPath = [{ x, y }];
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current.isDrawing || selectedTool !== 'freeform') return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawingRef.current.currentPath.push({ x, y });
    // Could do partial redraw feedback here.
  };

  const handlePointerUp = (e) => {
    if (!drawingRef.current.isDrawing) return;
    drawingRef.current.isDrawing = false;

    const rect = mapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { startX, startY, currentPath } = drawingRef.current;

    if (selectedTool === 'freeform') {
      // finalize the path.
      broadcastShape('draw', {
        id: Date.now().toString() + Math.random().toString(),
        type: 'freeform',
        userColor: myColor,
        userName: username,
        thickness,
        points: currentPath,
      });
    } else if (selectedTool === 'circle') {
      // radius = distance between start and end.
      const dx = x - startX;
      const dy = y - startY;
      const radius = Math.sqrt(dx * dx + dy * dy);
      broadcastShape('draw', {
        id: Date.now().toString() + Math.random().toString(),
        type: 'circle',
        userColor: myColor,
        userName: username,
        thickness,
        center: { x: startX, y: startY },
        radius,
      });
    } else if (selectedTool === 'arrow') {
      // arrow from start to end.
      broadcastShape('draw', {
        id: Date.now().toString() + Math.random().toString(),
        type: 'arrow',
        userColor: myColor,
        userName: username,
        thickness,
        start: { x: startX, y: startY },
        end: { x, y },
      });
    }

    drawingRef.current.currentPath = [];
  };

  // Undo last shape from me.
  const handleUndo = () => {
    broadcastShape('undo', null);
  };

  // Handle color change.
  const handleColorChange = (newColor) => {
    // Ensure newColor not in use.
    const colorInUse = connectedUsers.some((u) => u.color === newColor);
    if (colorInUse) {
      alert('That color is already taken by another user.');
      return;
    }

    // Free up the old color.
    setAvailableColors((prev) => [...prev, myColor]);

    // Update my color.
    setMyColor(newColor);
    setAvailableColors((prev) => prev.filter((c) => c !== newColor));

    // Also update connectedUsers.
    setConnectedUsers((prev) => {
      return prev.map((u) => {
        if (u.name === username) {
          return { ...u, color: newColor };
        }
        return u;
      });
    });
  };

  // Rendering shapes on top of the map.
  // We'll just do basic HTML elements for demonstration.
  // For freeform lines, we can create an SVG overlay.

  const renderShapes = () => {
    return shapes.map((shape) => {
      if (shape.type === 'freeform') {
        // We'll build an SVG polyline.
        const pathStr = shape.points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
        return (
          <path
            key={shape.id}
            d={pathStr}
            fill="none"
            stroke={shape.userColor}
            strokeWidth={shape.thickness}
          />
        );
      } else if (shape.type === 'circle') {
        return (
          <circle
            key={shape.id}
            cx={shape.center.x}
            cy={shape.center.y}
            r={shape.radius}
            fill="none"
            stroke={shape.userColor}
            strokeWidth={shape.thickness}
          />
        );
      } else if (shape.type === 'arrow') {
        // We'll do a line plus an arrowhead.
        const { start, end } = shape;
        // Arrow line
        const arrowLine = (
          <line
            key={shape.id + '-line'}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke={shape.userColor}
            strokeWidth={shape.thickness}
          />
        );
        // Arrowhead can be a small polygon or line.
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = 10 + shape.thickness * 2;
        const arrowPoint1 = {
          x: end.x - headLen * Math.cos(angle - Math.PI / 6),
          y: end.y - headLen * Math.sin(angle - Math.PI / 6),
        };
        const arrowPoint2 = {
          x: end.x - headLen * Math.cos(angle + Math.PI / 6),
          y: end.y - headLen * Math.sin(angle + Math.PI / 6),
        };
        const arrowHead = (
          <path
            key={shape.id + '-head'}
            d={`M${end.x},${end.y} L${arrowPoint1.x},${arrowPoint1.y} L${arrowPoint2.x},${arrowPoint2.y} Z`}
            fill={shape.userColor}
          />
        );
        return (
          <React.Fragment key={shape.id}>
            {arrowLine}
            {arrowHead}
          </React.Fragment>
        );
      }
      return null;
    });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Full-size map container */}
      <div
        className="w-full h-full relative"
        ref={mapRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* The map itself */}
        <img
          src={mapSrc}
          alt="Map"
          className="w-full h-full object-cover absolute top-0 left-0"
        />
        {/* Our SVG overlay for shapes */}
        <svg className="absolute top-0 left-0 w-full h-full">
          {renderShapes()}
        </svg>
      </div>

      {/* Controls overlay */}
      {showControls && (
        <motion.div
          className="absolute top-2 left-2 bg-white p-2 rounded-2xl shadow-xl grid gap-2"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Card>
            <CardContent className="flex flex-col gap-2">
              <div className="mb-2">
                <label className="block text-sm font-bold mb-1">Username:</label>
                <input
                  className="border rounded p-1 w-full bg-white text-black"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />

              </div>

              <div className="mb-2">
                <label className="block text-sm font-bold mb-1">Color:</label>
                <div className="flex flex-wrap gap-1">
                  {PRESET_COLORS.map((c) => (
                    <Button
                      key={c}
                      onClick={() => handleColorChange(c)}
                      style={{ backgroundColor: c }}
                      className="w-6 h-6 p-0 min-w-0"
                    />
                  ))}
                </div>
              </div>

              <div className="mb-2">
                <label className="block text-sm font-bold mb-1">Tool:</label>
                <select
                  className="border rounded p-1 w-full bg-white text-black"
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                >
                  <option value="freeform">Freeform</option>
                  <option value="circle">Circle</option>
                  <option value="arrow">Arrow</option>
                </select>
              </div>

              <div className="mb-2">
                <label className="block text-sm font-bold mb-1">Thickness: {thickness}</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={thickness}
                  onChange={(e) => setThickness(Number(e.target.value))}
                />
              </div>

              <div className="mb-2">
                <label className="block text-sm font-bold mb-1">Upload Map:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadMap}
                  className="block w-full"
                />
              </div>

              <Button onClick={handleUndo}>Undo Last</Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Toggle Controls Button */}
      <button
        className="absolute top-60 left-2 mt-40 bg-white px-2 py-1 rounded shadow"
        onClick={() => setShowControls(!showControls)}
      >
        {showControls ? 'Hide Controls' : 'Show Controls'}
      </button>

      {/* User list overlay */}
      {showUserList && (
        <motion.div
          className="absolute top-2 right-2 bg-white p-2 rounded-2xl shadow-xl"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Card>
            <CardContent>
              <h3 className="font-bold text-lg mb-2">Connected Users</h3>
              <ul>
                {connectedUsers.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: u.color }}
                    />
                    <span>{u.name}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Toggle User List */}
      <button
        className="absolute top-2 right-2 mt-40 bg-white px-2 py-1 rounded shadow"
        onClick={() => setShowUserList(!showUserList)}
      >
        {showUserList ? 'Hide Users' : 'Show Users'}
      </button>

      {/* Debug overlay */}
      {showDebug && (
        <motion.div
          className="absolute bottom-2 left-2 bg-white p-2 rounded-2xl shadow-xl w-96 max-h-48 overflow-auto"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardContent>
              <h3 className="font-bold text-lg mb-2">Debug Log</h3>
              {debugLog.map((log, idx) => (
                <div key={idx} className="text-xs mb-1">
                  {log}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Toggle Debug Button */}
      <button
        className="absolute bottom-2 left-2 mb-60 bg-white px-2 py-1 rounded shadow"
        onClick={() => setShowDebug(!showDebug)}
      >
        {showDebug ? 'Hide Debug' : 'Show Debug'}
      </button>
    </div>
  );
};

export default RealTimeMapCommunication;
