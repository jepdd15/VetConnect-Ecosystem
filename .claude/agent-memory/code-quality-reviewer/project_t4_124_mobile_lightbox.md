---
name: T4.124 Mobile File Attachment Viewer — Review Findings
description: PetHistoryScreen.js lightbox: pinch-scale snap bug (ISSUE), closeLightbox full reset (PASS), clientVisible filter (PASS), design tokens (PASS), hook order (PASS)
type: project
---

T4.124 adds image thumbnails, a full-screen lightbox (pinch/double-tap/pan), and uploadedAt date display to the attachment chips in PetHistoryScreen.

**ISSUE — Pinch gesture snaps to 1x at start of each new gesture**

The `onPinchEvent = Animated.event([{ nativeEvent: { scale: lightboxScale } }])` pattern maps nativeEvent.scale directly to the Animated.Value. Because nativeEvent.scale is always 1.0 at the START of each new pinch gesture, `lightboxScale` resets to 1.0 instantly when the user begins a second pinch. The correct pattern requires `lightboxScale.setOffset(lastScale.current)` before the gesture starts and driving the value relative to 0. This is a visible UX defect: zoom state appears to snap to 1x at gesture start before accumulating again.

**All other critical checks PASS:**
- closeLightbox resets scale, translateX/Y values AND offsets, AND all three lastX/Y/Scale refs — full reset confirmed
- Gesture handler nesting: PinchGestureHandler > TapGestureHandler > PanGestureHandler — correct
- GestureHandlerRootView wraps Modal content — correct
- react-native-gesture-handler imported, no npm install triggered
- mimeType?.startsWith('image/') — optional chaining guards undefined mimeType
- uploadedAt conditional guard (file.uploadedAt ? ... : null) — safe
- attachmentThumbnail, attachmentChip, lightboxOverlay, lightboxClose all borderRadius:0 — PASS
- All new useState/useRef at lines 813-831 — before all conditional returns at line 1972 — PASS
- PDFs route through handleOpenAttachment (Linking.openURL), not lightbox — PASS
- No alert()/confirm()/prompt() introduced
- visibleAttachments filter `a.clientVisible === true` at line 1597-1599 — preserved — PASS

**Why:** The direct Animated.event pinch pattern is sufficient only for a single gesture. Multi-gesture cumulative zoom requires offset-based accumulation on the scale value, matching the pan pattern already used for translateX/Y.

**How to apply:** Flag this in any future review of pinch-to-zoom with Animated.event + direct value mapping. The fix is to hook onPinchGestureEvent with a custom handler that uses offset/flatten pattern, OR use reanimated2 worklets.
