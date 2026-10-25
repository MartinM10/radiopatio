import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import { colors } from '../theme';

export type AppIconName =
  | 'shield-check'
  | 'shield-alert'
  | 'flag'
  | 'map-pin'
  | 'alert-triangle'
  | 'check'
  | 'refresh'
  | 'info'
  | 'lock'
  | 'users'
  | 'clock'
  | 'bell'
  | 'search'
  | 'x';

interface Props {
  name: AppIconName;
  color?: string;
  size?: number;
  strokeWidth?: number;
}

export const AppIcon: React.FC<Props> = ({
  name,
  color = colors.text,
  size = 20,
  strokeWidth = 2,
}) => {
  const p = {
    stroke: color,
    strokeWidth,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'shield-check' && (
        <>
          <Path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" {...p} />
          <Path d="M9 12l2 2 4-4" {...p} />
        </>
      )}

      {name === 'shield-alert' && (
        <>
          <Path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" {...p} />
          <Line x1="12" y1="8" x2="12" y2="13" {...p} />
          <Circle cx="12" cy="16.5" r="0.8" fill={color} />
        </>
      )}

      {name === 'flag' && (
        <>
          <Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" {...p} />
          <Line x1="4" y1="22" x2="4" y2="15" {...p} />
        </>
      )}

      {name === 'map-pin' && (
        <>
          <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" {...p} />
          <Circle cx="12" cy="10" r="3" {...p} />
        </>
      )}

      {name === 'alert-triangle' && (
        <>
          <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" {...p} />
          <Line x1="12" y1="9" x2="12" y2="13" {...p} />
          <Line x1="12" y1="17" x2="12.01" y2="17" {...p} />
        </>
      )}

      {name === 'check' && (
        <>
          <Path d="M20 6L9 17l-5-5" {...p} />
        </>
      )}

      {name === 'refresh' && (
        <>
          <Path d="M23 4v6h-6" {...p} />
          <Path d="M1 20v-6h6" {...p} />
          <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" {...p} />
        </>
      )}

      {name === 'info' && (
        <>
          <Circle cx="12" cy="12" r="10" {...p} />
          <Line x1="12" y1="16" x2="12" y2="12" {...p} />
          <Circle cx="12" cy="8" r="0.8" fill={color} />
        </>
      )}

      {name === 'lock' && (
        <>
          <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" {...p} />
          <Path d="M7 11V7a5 5 0 0 1 10 0v4" {...p} />
        </>
      )}

      {name === 'users' && (
        <>
          <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" {...p} />
          <Circle cx="9" cy="7" r="4" {...p} />
          <Path d="M23 21v-2a4 4 0 0 0-3-3.87" {...p} />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...p} />
        </>
      )}

      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="10" {...p} />
          <Path d="M12 6v6l4 2" {...p} />
        </>
      )}

      {name === 'bell' && (
        <>
          <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" {...p} />
          <Path d="M13.73 21a2 2 0 0 1-3.46 0" {...p} />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="7" {...p} />
          <Line x1="21" y1="21" x2="16.65" y2="16.65" {...p} />
        </>
      )}

      {name === 'x' && (
        <>
          <Line x1="18" y1="6" x2="6" y2="18" {...p} />
          <Line x1="6" y1="6" x2="18" y2="18" {...p} />
        </>
      )}
    </Svg>
  );
};
