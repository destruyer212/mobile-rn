import { Platform, StyleSheet, View } from 'react-native';

import { AppColors } from '../../theme/colors';

export type TopDownMotoVariant = 'active' | 'muted' | 'ghost';

type Props = {
  variant: TopDownMotoVariant;
  /** Punto rojo p.ej. ubicación obsoleta (>30 min). */
  showAlertDot?: boolean;
  /** Tamaño global del silueta (px). */
  size?: number;
  /** Rumbo en grados (0 = "nariz" hacia arriba en pantalla). Cuando no hay GPS de rumbo, dejar 0. */
  rotation?: number;
};

/**
 * Silueta cenital tipo apps de flota: cuerpo claro + franja oscura, dos ruedas.
 * "active": acento / menta. "muted": negro + plomo. "ghost": misma piel, muy transparente.
 */
export function TopDownMotoMarker({
  variant,
  showAlertDot,
  size = 36,
  rotation = 0,
}: Props) {
  const s = size;
  const wWheel = s * 0.3;
  const hHull = s * 0.52;
  const wHull = s * 0.46;
  const o = variant === 'ghost' ? 0.42 : 1;
  const isActive = variant === 'active';
  // Solo Views sólidas: LinearGradient no compone en el “snapshot” de Markers en Android (mapa en blanco).
  const bodyBase = isActive ? AppColors.accentDeep : '#64748B';
  const bodyHighlight = isActive ? '#5EEAD4' : '#CBD5E1';

  return (
    <View
      // Android: sin esto, el subárbol a veces se colapsa y el Marker sale vacío.
      collapsable={Platform.OS === 'android' ? false : undefined}
      style={[
        styles.root,
        { width: s * 0.9, height: s * 1.1, opacity: o, transform: [{ rotate: `${rotation}deg` }] },
      ]}
    >
      {showAlertDot ? <View style={[styles.alertDot, { right: 0, top: -1 }]} /> : null}
      <View
        style={[
          styles.wheel,
          {
            width: wWheel,
            height: wWheel,
            borderRadius: wWheel / 2,
            top: 0,
            backgroundColor: isActive ? '#0F172A' : '#020617',
            borderColor: isActive ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
          },
        ]}
      />
      <View
        style={[
          styles.hull,
          {
            width: wHull,
            height: hHull,
            borderRadius: 6,
            top: s * 0.22,
            backgroundColor: bodyBase,
            borderColor: isActive ? 'rgba(15,23,42,0.25)' : 'rgba(15,23,42,0.45)',
          },
        ]}
      >
        <View
          style={[
            styles.hullHighlight,
            {
              backgroundColor: bodyHighlight,
              height: hHull * 0.42,
            },
          ]}
        />
        <View
          style={[
            styles.cockpit,
            { backgroundColor: isActive ? 'rgba(15,23,42,0.92)' : 'rgba(2,6,23,0.95)' },
          ]}
        />
        <View
          style={[
            styles.splitLine,
            { top: hHull * 0.18, height: hHull * 0.55, left: wHull / 2 - 1.2 },
          ]}
        />
      </View>
      <View
        style={[
          styles.wheel,
          {
            width: wWheel,
            height: wWheel,
            borderRadius: wWheel / 2,
            bottom: 0,
            backgroundColor: isActive ? '#0F172A' : '#020617',
            borderColor: isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  wheel: {
    position: 'absolute',
    borderWidth: 1.5,
    shadowColor: '#0F172A',
    shadowOpacity: 0.28,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  hull: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    borderWidth: 1.2,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  hullHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0.9,
  },
  cockpit: {
    width: '50%',
    height: '40%',
    borderRadius: 3,
  },
  splitLine: {
    position: 'absolute',
    width: 2.4,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 1,
  },
  alertDot: {
    position: 'absolute',
    zIndex: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F87171',
    borderWidth: 1.2,
    borderColor: '#F8FAFC',
  },
});
