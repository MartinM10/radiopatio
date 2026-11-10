import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../components/AppIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { useIdentity } from '../components/IdentityGate';
import { categoryById } from '../data/categories';
import { Incident, IncidentMessage, messageAuthorLabel } from '../data/types';
import { areaName } from '../data/neighborhood';
import { readableAddress } from '../lib/address';
import { ApiError, apiAppealIncident, apiGetMessages, apiPostMessage, incidentPhotoUrl, incidentShareUrl } from '../lib/api';
import { expiryLabel, shouldAskPresence } from '../lib/lifetime';
import { checkText, timeAgo } from '../lib/privacy';
import { useIncidents } from '../store';
import { colors, radius, severityColor, severityLabel } from '../theme';

interface Props {
  incidentId: string;
  onClose: () => void;
  /** «Ver en el mapa»: cierra el detalle y centra el mapa en este aviso. */
  onShowOnMap: (id: string) => void;
}

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export const IncidentDetailScreen = ({ incidentId, onClose, onShowOnMap }: Props) => {
  const insets = useSafeAreaInsets();
  const { incidents, confirm, flag, resolve, stillThere, isConfirmed } = useIncidents();
  const { requireIdentity } = useIdentity();
  const incident = incidents.find((i) => i.id === incidentId);

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Volver"
        style={styles.back}
      >
        <AppIcon name="chevron-left" color={colors.text} size={22} />
      </Pressable>
      <Text style={styles.headerTitle}>Aviso</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (!incident) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        {header}
        <View style={styles.gone}>
          <Text style={styles.goneTitle}>Este aviso ya no está disponible</Text>
          <Text style={styles.goneText}>Los avisos desaparecen solos al caducar (de 12 horas a 7 días según el tipo), al resolverse o cuando se ocultan tras varias denuncias.</Text>
        </View>
      </View>
    );
  }

  const cat = categoryById(incident.category);
  const sev = severityColor[cat.severity];
  const verified = isConfirmed(incident);
  const street = readableAddress(incident.zone.address);
  const place = street ?? areaName(incident.zone);

  const onConfirm = async () => {
    if (!(await requireIdentity())) return;
    confirm(incident.id);
    tap();
  };

  const onFlag = () =>
    Alert.alert('Denunciar aviso', 'Se ocultará para ti y se enviará a moderación si identifica a personas, es falso o incita al odio.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Denunciar',
        style: 'destructive',
        onPress: async () => {
          if (!(await requireIdentity())) return;
          flag(incident.id);
          tap();
          onClose();
        },
      },
    ]);

  const onResolve = () =>
    Alert.alert('¿Ya está resuelto?', 'El aviso se marcará como resuelto y desaparecerá en un par de horas.', [
      { text: 'Todavía no', style: 'cancel' },
      {
        text: 'Sí, resuelto',
        onPress: () => {
          resolve(incident.id);
          tap();
        },
      },
    ]);

  const onPresence = async (here: boolean) => {
    if (!(await requireIdentity())) return;
    tap();
    const res = await stillThere(incident.id, here);
    if (!res) return;
    Alert.alert(
      'Gracias',
      res.resolved
        ? 'Varios vecinos dicen que ya no está: el aviso se cerrará en un par de horas.'
        : here && res.extended
          ? 'Hemos ampliado el aviso para que siga visible más tiempo.'
          : here
            ? 'Anotado: el aviso sigue ahí.'
            : 'Anotado: si más vecinos coinciden, el aviso se cerrará.',
    );
  };

  const onAppeal = () =>
    apiAppealIncident(incident.id)
      .then(() => Alert.alert('Recurso enviado', 'Tu aviso volverá a revisión. Gracias por tu paciencia.'))
      .catch(() => Alert.alert('Error', 'No se pudo enviar el recurso.'));

  const onShare = (inc: Incident) => {
    const where = readableAddress(inc.zone.address) ?? areaName(inc.zone);
    const label = categoryById(inc.category).label;
    Share.share({
      message: `${label} cerca de ${where} — Radio Patio\n${incidentShareUrl(inc.id)}`,
    }).catch(() => {});
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: sev + '22', borderColor: sev + '55' }]}>
            <CategoryIcon id={incident.category} color={sev} size={34} strokeWidth={2.2} />
          </View>
          <Text style={styles.title}>{cat.label}</Text>
          <View style={styles.pills}>
            <View style={[styles.pill, { backgroundColor: sev + '18', borderColor: sev + '60' }]}>
              <Text style={[styles.pillText, { color: sev }]}>{severityLabel[cat.severity]}</Text>
            </View>
            <View style={styles.pill}>
              <AppIcon name="clock" color={colors.muted} size={12} />
              <Text style={styles.pillText}>{timeAgo(incident.createdAt)}</Text>
            </View>
            {incident.resolved && (
              <View style={[styles.pill, styles.pillOk]}>
                <AppIcon name="check" color={colors.ok} size={12} strokeWidth={2.6} />
                <Text style={[styles.pillText, { color: colors.ok }]}>Resuelto</Text>
              </View>
            )}
            <View style={[styles.pill, verified && styles.pillOk]}>
              <AppIcon name={verified ? 'shield-check' : 'clock'} color={verified ? colors.ok : colors.muted} size={12} />
              <Text style={[styles.pillText, verified && { color: colors.ok }]}>
                {verified ? `Confirmado (${incident.confirmations})` : 'Sin confirmar'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.place}>
            <AppIcon name="map-pin" color={colors.accent} size={18} />
            <View style={{ flex: 1 }}>
              <Text style={styles.placeMain}>{place}</Text>
              <Text style={styles.placeSub}>Zona aproximada (~450 m). La posición exacta no se publica.</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Qué ha ocurrido</Text>
          <Text style={styles.desc}>{incident.description}</Text>
          {incident.hasPhoto && (
            <Image
              source={{ uri: incidentPhotoUrl(incident.id) }}
              style={styles.photo}
              accessibilityLabel="Foto adjunta al aviso"
            />
          )}
          <Text style={styles.expiry}>{expiryLabel(incident)}</Text>
        </View>

        {incident.mine ? (
          incident.status === 'hidden' ? (
            <Pressable onPress={onAppeal} accessibilityRole="button" style={styles.secondary}>
              <Text style={styles.secondaryText}>Recurrir ocultación</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.mineBox}>
                <Text style={styles.mineText}>
                  {incident.resolved
                    ? 'Has dado este aviso por resuelto. Desaparecerá en un par de horas.'
                    : 'Este aviso es tuyo. Otros vecinos pueden confirmarlo.'}
                </Text>
              </View>
              {!incident.resolved && (
                <Pressable onPress={onResolve} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}>
                  <AppIcon name="check" color={colors.ok} size={16} strokeWidth={2.6} />
                  <Text style={styles.secondaryText}>Ya está resuelto</Text>
                </Pressable>
              )}
            </>
          )
        ) : incident.resolved ? (
          <View style={styles.mineBox}>
            <Text style={styles.mineText}>Este aviso se ha dado por resuelto y desaparecerá en un par de horas.</Text>
          </View>
        ) : (
          <Pressable
            onPress={onConfirm}
            disabled={incident.confirmedByMe}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, incident.confirmedByMe && styles.primaryDone, pressed && { opacity: 0.85 }]}
          >
            <AppIcon name="check" color={incident.confirmedByMe ? colors.ok : '#fff'} size={18} strokeWidth={2.6} />
            <Text style={[styles.primaryText, incident.confirmedByMe && { color: colors.ok }]}>
              {incident.confirmedByMe ? 'Lo has confirmado' : 'Lo he visto'}
            </Text>
          </Pressable>
        )}

        {shouldAskPresence(incident) && (
          <View style={styles.presence}>
            <Text style={styles.presenceTitle}>¿Sigue ahí?</Text>
            <Text style={styles.presenceText}>Este aviso está a punto de caducar. Si pasas cerca, cuéntanos si todavía se ve.</Text>
            <View style={styles.presenceRow}>
              <Pressable onPress={() => onPresence(true)} accessibilityRole="button" style={({ pressed }) => [styles.presenceBtn, styles.presenceYes, pressed && { opacity: 0.85 }]}>
                <Text style={styles.presenceYesText}>Sí, sigue ahí</Text>
              </Pressable>
              <Pressable onPress={() => onPresence(false)} accessibilityRole="button" style={({ pressed }) => [styles.presenceBtn, styles.presenceNo, pressed && { opacity: 0.85 }]}>
                <Text style={styles.presenceNoText}>Ya no está</Text>
              </Pressable>
            </View>
          </View>
        )}

        {incident.zone.lat != null && incident.zone.lng != null && (
          <Pressable onPress={() => onShowOnMap(incident.id)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}>
            <AppIcon name="map-pin" color={colors.primary} size={16} />
            <Text style={styles.secondaryText}>Ver en el mapa</Text>
          </Pressable>
        )}

        <Pressable onPress={() => onShare(incident)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}>
          <AppIcon name="share" color={colors.primary} size={16} />
          <Text style={styles.secondaryText}>Compartir este aviso</Text>
        </Pressable>

        {incident.status === 'active' && <Chat incidentId={incident.id} requireIdentity={requireIdentity} />}

        {!incident.mine && (
          <Pressable onPress={onFlag} accessibilityRole="button" hitSlop={8} style={styles.flag}>
            <AppIcon name="flag" color={colors.muted} size={15} />
            <Text style={styles.flagText}>Denunciar este aviso</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
};

const CHAT_POLL_MS = 20_000;
const CHAT_MAX = 280;

/**
 * Chat anónimo del aviso: ni el autor ni quien escribe se identifican entre
 * sí, solo «Tú» / «Un vecino» (el servidor nunca manda quién es quién).
 */
const Chat = ({ incidentId, requireIdentity }: { incidentId: string; requireIdentity: () => Promise<boolean> }) => {
  const [messages, setMessages] = React.useState<IncidentMessage[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const load = React.useCallback(() => {
    apiGetMessages(incidentId)
      .then((data) => {
        setMessages(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [incidentId]);

  React.useEffect(() => {
    load();
    const timer = setInterval(load, CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const problem = draft.trim().length > 0 ? checkText(draft) : null;
  const canSend = draft.trim().length > 0 && !problem && !sending;

  const send = async () => {
    if (!canSend) return;
    if (!(await requireIdentity())) return;
    const body = draft.trim();
    setSending(true);
    try {
      const created = await apiPostMessage(incidentId, body);
      setMessages((prev) => [...prev, created]);
      setDraft('');
      tap();
    } catch (e) {
      Alert.alert('No se pudo enviar', e instanceof ApiError ? e.message : 'Inténtalo de nuevo en un momento.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionLabel}>Chat del aviso</Text>
      <Text style={styles.chatHint}>Anónimo: nadie ve quién escribe, solo si es el autor o qué número de vecino es.</Text>

      {!loaded ? (
        <ActivityIndicator color={colors.muted} style={{ marginVertical: 10 }} />
      ) : messages.length === 0 ? (
        <Text style={styles.chatEmpty}>Todavía no hay mensajes.</Text>
      ) : (
        <View style={styles.chatList}>
          {messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.mine ? styles.bubbleMine : styles.bubbleOther]}>
              <Text style={styles.bubbleAuthor}>{messageAuthorLabel(m)}</Text>
              <Text style={styles.bubbleText}>{m.body}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.chatInputRow}>
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.slice(0, CHAT_MAX))}
          placeholder="Escribe un mensaje…"
          placeholderTextColor={colors.muted}
          style={[styles.chatInput, problem ? { borderColor: colors.danger } : null]}
          multiline
          editable={!sending}
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Enviar mensaje"
          style={[styles.chatSend, !canSend && styles.chatSendOff]}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <AppIcon name="send" color="#fff" size={16} />}
        </Pressable>
      </View>
      {problem && <Text style={styles.chatProblem}>{problem}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  content: { padding: 20, gap: 14 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent' },
  pillOk: { backgroundColor: 'rgba(16,185,129,0.12)' },
  pillText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 },
  place: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  placeMain: { color: colors.text, fontSize: 16, fontWeight: '800' },
  placeSub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  desc: { color: colors.text, fontSize: 16, lineHeight: 24 },
  photo: { width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.surface2, marginTop: 4 },
  expiry: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 4 },
  chatHint: { color: colors.muted, fontSize: 12, marginTop: -4 },
  chatEmpty: { color: colors.muted, fontSize: 13, textAlign: 'center', paddingVertical: 10 },
  chatList: { gap: 8 },
  bubble: { maxWidth: '85%', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: colors.surface2 },
  bubbleAuthor: { color: colors.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2 },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  chatSend: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatSendOff: { backgroundColor: colors.line },
  chatProblem: { color: colors.danger, fontSize: 12, marginTop: 4 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.primary },
  primaryDone: { backgroundColor: 'rgba(16,185,129,0.12)' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary + '66' },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  presence: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.accent + '55', padding: 16, gap: 8 },
  presenceTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  presenceText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  presenceRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  presenceBtn: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  presenceYes: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  presenceYesText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  presenceNo: { backgroundColor: colors.surface, borderColor: colors.line },
  presenceNoText: { color: colors.textMuted, fontSize: 14, fontWeight: '800' },
  mineBox: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: 14 },
  mineText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  flag: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44 },
  flagText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  gone: { padding: 28, alignItems: 'center', gap: 10 },
  goneTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  goneText: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
