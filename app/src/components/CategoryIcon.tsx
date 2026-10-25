import React from 'react';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import { CategoryId } from '../data/types';
import { colors } from '../theme';

interface Props {
  id: CategoryId | 'all';
  color?: string;
  size?: number;
  strokeWidth?: number;
}

export const CategoryIcon: React.FC<Props> = ({
  id,
  color = colors.text,
  size = 24,
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
      {id === 'all' && (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M3.6 9h16.8M3.6 15h16.8" {...p} />
          <Path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" {...p} />
        </>
      )}

      {/* Hogar / Vivienda */}
      {id === 'hogar' && (
        <>
          <Path d="M3 10.5L12 3l9 7.5" {...p} />
          <Path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" {...p} />
          <Rect x="10" y="14" width="4" height="7" {...p} />
        </>
      )}

      {/* Vehículo */}
      {id === 'vehiculo' && (
        <>
          <Path d="M5 17h14a2 2 0 0 0 2-2v-4l-3-5H6L3 11v4a2 2 0 0 0 2 2z" {...p} />
          <Circle cx="7.5" cy="17.5" r="2.5" {...p} />
          <Circle cx="16.5" cy="17.5" r="2.5" {...p} />
          <Line x1="10" y1="17" x2="14" y2="17" {...p} />
        </>
      )}

      {/* Hurto / Tirón */}
      {id === 'hurto' && (
        <>
          <Rect x="4" y="8" width="16" height="13" rx="2" {...p} />
          <Path d="M8 8V6a4 4 0 0 1 8 0v2" {...p} />
          <Line x1="12" y1="13" x2="12" y2="15" {...p} />
        </>
      )}

      {/* Agresión */}
      {id === 'agresion' && (
        <>
          <Path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" {...p} />
          <Line x1="12" y1="8" x2="12" y2="13" {...p} />
          <Circle cx="12" cy="16.5" r="0.8" fill={color} />
        </>
      )}

      {/* Vandalismo */}
      {id === 'vandalismo' && (
        <>
          <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" {...p} />
        </>
      )}

      {/* Actividad sospechosa */}
      {id === 'sospechoso' && (
        <>
          <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" {...p} />
          <Circle cx="12" cy="12" r="3" {...p} />
        </>
      )}

      {/* Altercado / Ruido */}
      {id === 'altercado' && (
        <>
          <Path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z" {...p} />
          <Path d="M16 8a5 5 0 0 1 0 8" {...p} />
          <Path d="M19 5a9 9 0 0 1 0 14" {...p} />
        </>
      )}

      {/* Otro */}
      {id === 'otro' && (
        <>
          <Circle cx="12" cy="12" r="8" {...p} />
          <Line x1="12" y1="8" x2="12" y2="12" {...p} />
          <Circle cx="12" cy="15.5" r="0.8" fill={color} />
        </>
      )}
    </Svg>
  );
};
