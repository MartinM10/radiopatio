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
          <Path d="M12 2.5L4 6v6.5c0 4.7 3.3 8.3 8 9.5 4.7-1.2 8-4.8 8-9.5V6l-8-3.5z" {...p} />
          <Line x1="12" y1="8.5" x2="12" y2="13" {...p} />
          <Circle cx="12" cy="16.4" r="0.8" fill={color} />
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

      {/* Corte de agua */}
      {id === 'corte_agua' && (
        <>
          <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" {...p} />
          <Path d="M9 13.5c1 1.5 2 2 3 2s2-.5 3-2" {...p} />
        </>
      )}

      {/* Corte de luz */}
      {id === 'corte_luz' && (
        <>
          <Polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" {...p} />
        </>
      )}

      {/* Farola / Alumbrado */}
      {id === 'alumbrado' && (
        <>
          <Path d="M9 18h6" {...p} />
          <Path d="M10 22h4" {...p} />
          <Path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" {...p} />
          <Line x1="12" y1="6" x2="12" y2="10" {...p} />
        </>
      )}

      {/* Asfalto / Calzada */}
      {id === 'calzada' && (
        <>
          <Path d="M4 21L9.5 4h5L20 21" {...p} />
          <Line x1="2" y1="21" x2="22" y2="21" {...p} />
          <Line x1="7" y1="14" x2="17" y2="14" {...p} />
          <Line x1="8.5" y1="9" x2="15.5" y2="9" {...p} />
        </>
      )}

      {/* Limpieza / Residuos */}
      {id === 'limpieza' && (
        <>
          <Path d="M3 6h18" {...p} />
          <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" {...p} />
          <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...p} />
          <Line x1="10" y1="11" x2="10" y2="17" {...p} />
          <Line x1="14" y1="11" x2="14" y2="17" {...p} />
        </>
      )}

      {/* Inundación */}
      {id === 'inundacion' && (
        <>
          <Path d="M2.5 8.5c1.6 0 2.4-1.5 4-1.5s2.4 1.5 4 1.5 2.4-1.5 4-1.5 2.4 1.5 4 1.5 1.6-.8 3-1.3" {...p} />
          <Path d="M2.5 13.5c1.6 0 2.4-1.5 4-1.5s2.4 1.5 4 1.5 2.4-1.5 4-1.5 2.4 1.5 4 1.5 1.6-.8 3-1.3" {...p} />
          <Path d="M2.5 18.5c1.6 0 2.4-1.5 4-1.5s2.4 1.5 4 1.5 2.4-1.5 4-1.5 2.4 1.5 4 1.5 1.6-.8 3-1.3" {...p} />
        </>
      )}

      {/* Incendio / humo */}
      {id === 'incendio' && (
        <>
          <Path d="M12 3c.8 3 4.5 4.8 5.6 8.3A6 6 0 0 1 12 20.5a6 6 0 0 1-5.6-8.2c.6-1.4 1.6-2.3 2.6-2.8 0 1.4.6 2.5 1.6 3C10.2 9.5 10.6 5.6 12 3z" {...p} />
          <Path d="M12 20.5a2.5 2.5 0 0 1-2.5-2.5c0-1.4 1.2-2.2 2.5-3.8 1.3 1.6 2.5 2.4 2.5 3.8a2.5 2.5 0 0 1-2.5 2.5z" {...p} />
        </>
      )}

      {/* Derrumbe */}
      {id === 'derrumbe' && (
        <>
          <Line x1="2.5" y1="21" x2="21.5" y2="21" {...p} />
          <Rect x="4" y="15.5" width="7" height="5.5" rx="0.6" {...p} />
          <Rect x="12.5" y="15.5" width="7" height="5.5" rx="0.6" {...p} />
          <Rect x="7.5" y="10" width="7" height="5.5" rx="0.6" {...p} />
          <Path d="M15.2 3.6l4.3 1.4-1.4 4.3-4.3-1.4z" {...p} />
        </>
      )}

      {/* Árbol caído */}
      {id === 'arbol' && (
        <>
          <Path d="M12 2.5a5 5 0 0 0-4.8 6.4A4.2 4.2 0 0 0 8 17h8a4.2 4.2 0 0 0 .8-8.1A5 5 0 0 0 12 2.5z" {...p} />
          <Line x1="12" y1="17" x2="12" y2="21.5" {...p} />
          <Line x1="8" y1="21.5" x2="16" y2="21.5" {...p} />
        </>
      )}

      {/* Calle cortada */}
      {id === 'calle_cortada' && (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Line x1="7.5" y1="12" x2="16.5" y2="12" {...p} />
        </>
      )}

      {/* Objeto / Mascota perdida */}
      {id === 'perdido' && (
        <>
          <Circle cx="12" cy="14" r="4.5" {...p} />
          <Circle cx="7" cy="9.5" r="2" fill={color} />
          <Circle cx="17" cy="9.5" r="2" fill={color} />
          <Circle cx="10" cy="5.5" r="1.8" fill={color} />
          <Circle cx="14" cy="5.5" r="1.8" fill={color} />
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
