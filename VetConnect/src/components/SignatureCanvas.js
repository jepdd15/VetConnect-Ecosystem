/**
 * SignatureCanvas — WebView-based freehand signature capture component.
 *
 * Renders a full HTML5 canvas inside a WebView for pointer-event-driven drawing.
 * Communicates with the parent via postMessage in both directions.
 *
 * Parent → WebView:
 *   { action: 'export' } — respond with { type: 'signature', data: base64DataURI }
 *   { action: 'clear'  } — clear the canvas
 *
 * WebView → Parent:
 *   { type: 'signature', data: 'data:image/png;base64,...' }
 *   { type: 'clear' }
 *
 * Usage:
 *   const ref = useRef();
 *   <SignatureCanvas ref={ref} onSignatureCapture={handleCapture} />
 *   ref.current.exportSignature();   // triggers onSignatureCapture callback
 *   ref.current.clearSignature();    // clears the canvas
 */

import {
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../theme/mobileTokens';

// ---------------------------------------------------------------------------
// Signature canvas HTML — self-contained, no external dependencies
// ---------------------------------------------------------------------------

const SIGNATURE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #FFFFFF; }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      border: 2px dashed #3E2723;
      cursor: crosshair;
      touch-action: none;
    }
  </style>
</head>
<body>
  <canvas id="sig"></canvas>
  <script>
    var canvas  = document.getElementById('sig');
    var ctx     = canvas.getContext('2d');
    var drawing = false;

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      ctx.strokeStyle = '#3E2723';
      ctx.lineWidth   = 2;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'clear' }));
      }
    }

    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('pointerdown', function(e) {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function(e) {
      if (!drawing) return;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      e.preventDefault();
    });

    canvas.addEventListener('pointerup',    function(e) { drawing = false; });
    canvas.addEventListener('pointerleave', function(e) { drawing = false; });

    document.addEventListener('message', handleMessage);
    window.addEventListener('message',   handleMessage);

    function handleMessage(e) {
      try {
        var msg = JSON.parse(e.data);
        if (msg.action === 'export') {
          var data = canvas.toDataURL('image/png');
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'signature', data: data })
          );
        } else if (msg.action === 'clear') {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'clear' })
          );
        }
      } catch (err) {}
    }
  </script>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SignatureCanvas = forwardRef(function SignatureCanvas(
  { onSignatureCapture, onClear, width = '100%', height = 200 },
  ref,
) {
  const webViewRef = useRef(null);

  /**
   * Send a postMessage to the WebView canvas.
   * @param {'export'|'clear'} action
   */
  function sendMessage(action) {
    if (!webViewRef.current) return;
    webViewRef.current.postMessage(JSON.stringify({ action }));
  }

  /** Imperative handle — called by the parent to trigger export or clear. */
  useImperativeHandle(ref, () => ({
    exportSignature() {
      sendMessage('export');
    },
    clearSignature() {
      sendMessage('clear');
    },
  }));

  /**
   * Handle messages arriving from the WebView canvas.
   * Delegates to the appropriate callback prop.
   */
  function handleMessage(event) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'signature' && typeof onSignatureCapture === 'function') {
        onSignatureCapture(msg.data);
      } else if (msg.type === 'clear' && typeof onClear === 'function') {
        onClear();
      }
    } catch {
      // Malformed message — ignore safely
    }
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: SIGNATURE_HTML }}
        onMessage={handleMessage}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        style={styles.webView}
      />
    </View>
  );
});

export default SignatureCanvas;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
});
