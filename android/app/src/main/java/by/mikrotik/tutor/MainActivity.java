package by.mikrotik.tutor;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyManagementException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Оболочка приложения: WebView загружает общий веб-контент учебника
 * из assets (app/index.html). Всё работает офлайн.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";
    private WebView webView;

    /* Нативные сессии RouterOS API для прямого подключения к физическому MikroTik.
       Javascript-интерфейс доступен странице как window.mt (mtOpen/mtSend/mtClose). */
    private static final Map<Integer, RouterSession> SESSIONS = new ConcurrentHashMap<>();
    private static final AtomicInteger NEXT_ID = new AtomicInteger(1);

    // Доверяем любым сертификатам: у MikroTik API-SSL обычно самоподписанный сертификат.
    private static final TrustManager[] TRUST_ALL = new TrustManager[]{
            new X509TrustManager() {
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
                @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
            }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setTextZoom(100); // фиксированный масштаб шрифта интерфейса
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                // локальные страницы грузим в WebView, внешние — в браузер
                if (scheme == null || "file".equals(scheme) || "about".equals(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // браузер недоступен — игнорируем
                }
                return true;
            }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }

        // Мост для кнопки «⟳ Обновить»: запрос к api.github.com выполняется
        // нативно (без CORS-ограничений file://). URL строго ограничен allowlist.
        webView.addJavascriptInterface(new GithubBridge(), "Android");
        // Мост прямого подключения к MikroTik (RouterOS API / API-SSL через сокеты).
        webView.addJavascriptInterface(new MikrotikBridge(), "mt");
    }

    /**
     * Небольшой HTTP-клиент, доступный из JavaScript.
     * Вызывается из фонового потока WebView, сеть там разрешена.
     */
    public static class GithubBridge {
        private static final String ALLOW_PREFIX =
                "https://api.github.com/repos/zigorminsk-debug/mikrotik/";

        @JavascriptInterface
        public String httpGet(String url) {
            HttpURLConnection conn = null;
            try {
                if (url == null || !url.startsWith(ALLOW_PREFIX)) {
                    return null; // всё кроме официального репозитория — игнорируем
                }
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/vnd.github+json");
                conn.setRequestProperty("User-Agent", "MikroTik-Guide-App");
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    return null;
                }
                BufferedReader br = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line).append('\n');
                }
                br.close();
                return sb.toString();
            } catch (Exception e) {
                return null; // нет сети / таймаут — JS покажет экран «повторить»
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }
    }

    /**
     * Сессия подключения к одному роутеру: сокет, логин, чтение ответов API.
     */
    private static class RouterSession {
        private static final int CONNECT_TIMEOUT = 15000;
        private static final int SOCKET_TIMEOUT = 60000;

        Socket socket;
        OutputStream out;
        InputStream in;

        RouterSession(String host, int port, boolean ssl, String user, String pass) throws Exception {
            InetSocketAddress addr = new InetSocketAddress(host, port);
            if (ssl) {
                SSLContext sc = SSLContext.getInstance("TLS");
                sc.init(null, TRUST_ALL, new SecureRandom());
                socket = sc.getSocketFactory().createSocket();
            } else {
                socket = new Socket();
            }
            socket.connect(addr, CONNECT_TIMEOUT);
            socket.setSoTimeout(SOCKET_TIMEOUT);
            socket.setTcpNoDelay(true);
            out = socket.getOutputStream();
            in = socket.getInputStream();

            // Логин RouterOS API: plain-text, при наличии вызова — challenge-ответ (MD5).
            JSONObject rep = sendAndRead(loginPassword(user, pass));
            if (!"done".equals(rep.optString("status")))
                throw new Exception(rep.optString("message", "ошибка логина"));
            String ret = attrOf(rep, "ret");
            if (ret != null) {
                rep = sendAndRead(loginResponse(user, ret, pass));
                if (!"done".equals(rep.optString("status")))
                    throw new Exception(rep.optString("message", "ошибка логина (challenge)"));
            }
        }

        void close() {
            try { socket.close(); } catch (Exception ignored) {}
        }

        /* ---------- отправка ---------- */
        private void sendBytes(byte[] b) throws IOException {
            if (b.length < 255) out.write(b.length);
            else {
                out.write(0xFF);
                out.write(new byte[]{
                        (byte) ((b.length >>> 24) & 0xFF),
                        (byte) ((b.length >>> 16) & 0xFF),
                        (byte) ((b.length >>> 8) & 0xFF),
                        (byte) (b.length & 0xFF)
                });
            }
            out.write(b);
        }

        private void sendWords(List<Object> words) throws IOException {
            for (Object o : words) {
                byte[] b = o instanceof String ? ((String) o).getBytes(StandardCharsets.UTF_8) : (byte[]) o;
                sendBytes(b);
            }
            out.flush();
        }

        /* ---------- чтение ---------- */
        private int readByte() throws IOException {
            int b = in.read();
            if (b < 0) throw new IOException("соединение закрыто роутером");
            return b;
        }

        private void readFully(byte[] b) throws IOException {
            int got = 0;
            while (got < b.length) {
                int n = in.read(b, got, b.length - got);
                if (n < 0) throw new IOException("соединение закрыто роутером");
                got += n;
            }
        }

        private String readWord() throws IOException {
            int len = readByte();
            byte[] b;
            if (len == 0xFF) {
                len = ((readByte() & 0xFF) << 24) | ((readByte() & 0xFF) << 16)
                        | ((readByte() & 0xFF) << 8) | (readByte() & 0xFF);
            }
            b = new byte[len];
            readFully(b);
            return new String(b, StandardCharsets.UTF_8);
        }

        // Читает ответ до завершающего статуса (!done / !fatal / !trap);
        // элементы !re становятся элементами ответа (например, строки /print).
        private JSONObject readReply() throws IOException {
            List<String> cur = new ArrayList<>();
            List<List<String>> items = new ArrayList<>();
            String status = "done";
            while (true) {
                String w = readWord();
                if (w.startsWith("!")) {
                    status = w.substring(1);
                    if (!w.equals("!re")) break;
                    items.add(cur);
                    cur = new ArrayList<>();
                } else {
                    cur.add(w);
                }
            }
            if (!cur.isEmpty()) items.add(cur);
            return reply(status, messageOf(items.isEmpty() ? null : items.get(items.size() - 1), ""), items);
        }

        private JSONObject sendAndRead(List<Object> words) throws Exception {
            sendWords(words);
            return readReply();
        }

        private String messageOf(List<String> words, String def) {
            if (words == null) return def;
            for (String w : words) {
                if (w.startsWith("=")) {
                    int eq = w.indexOf('=');
                    if (eq > 0 && "message".equals(w.substring(1, eq))) return w.substring(eq + 1);
                }
            }
            return def;
        }

        private String attrOf(JSONObject rep, String name) {
            try {
                JSONArray items = rep.optJSONArray("items");
                if (items != null && items.length() > 0) {
                    JSONArray attrs = items.getJSONObject(0).optJSONArray("attrs");
                    if (attrs != null) {
                        for (int i = 0; i < attrs.length(); i++) {
                            JSONObject a = attrs.getJSONObject(i);
                            if (name.equals(a.optString("name"))) return a.optString("value");
                        }
                    }
                }
            } catch (Exception ignored) {}
            return null;
        }

        private JSONObject reply(String status, String message, List<List<String>> items) {
            JSONObject o = new JSONObject();
            o.put("status", status);
            o.put("message", message == null ? "" : message);
            JSONArray jItems = new JSONArray();
            if (items != null) {
                for (List<String> it : items) {
                    JSONObject item = new JSONObject();
                    JSONArray attrs = new JSONArray();
                    for (String w : it) {
                        if (w.startsWith("=")) {
                            int eq = w.indexOf('=');
                            if (eq > 0) {
                                JSONObject a = new JSONObject();
                                a.put("name", w.substring(1, eq));
                                a.put("value", w.substring(eq + 1));
                                attrs.put(a);
                            }
                        }
                    }
                    item.put("attrs", attrs);
                    jItems.put(item);
                }
            }
            o.put("items", jItems);
            return o;
        }
    }

    /** Мост RouterOS API → JavaScript (window.mt). */
    public static class MikrotikBridge {
        @JavascriptInterface
        public int mtOpen(String host, int port, boolean ssl, String user, String pass) {
            RouterSession session = new RouterSession(host, port, ssl, user, pass);
            int id = NEXT_ID.getAndIncrement();
            SESSIONS.put(id, session);
            return id;
        }

        @JavascriptInterface
        public String mtSend(int id, String wordsJson) {
            RouterSession session = SESSIONS.get(id);
            if (session == null) return reply("error", "сессия не найдена или закрыта", null).toString();
            try {
                JSONArray arr = new JSONArray(wordsJson);
                List<Object> words = new ArrayList<>();
                for (int i = 0; i < arr.length(); i++) words.add(arr.getString(i));
                return session.sendAndRead(words).toString();
            } catch (Exception e) {
                return reply("error", e.getMessage(), null).toString();
            }
        }

        @JavascriptInterface
        public void mtClose(int id) {
            RouterSession session = SESSIONS.remove(id);
            if (session != null) session.close();
        }

        private JSONObject reply(String status, String message, List<List<String>> items) {
            JSONObject o = new JSONObject();
            o.put("status", status);
            o.put("message", message == null ? "" : message);
            JSONArray jItems = new JSONArray();
            if (items != null) {
                for (List<String> it : items) {
                    JSONObject item = new JSONObject();
                    JSONArray attrs = new JSONArray();
                    for (String w : it) {
                        if (w.startsWith("=")) {
                            int eq = w.indexOf('=');
                            if (eq > 0) {
                                JSONObject a = new JSONObject();
                                a.put("name", w.substring(1, eq));
                                a.put("value", w.substring(eq + 1));
                                attrs.put(a);
                            }
                        }
                    }
                    item.put("attrs", attrs);
                    jItems.put(item);
                }
            }
            o.put("items", jItems);
            return o;
        }
    }

    /* ---------- вспомогательное для логина ---------- */
    private static List<Object> loginPassword(String user, String pass) {
        List<Object> words = new ArrayList<>();
        words.add("/login");
        words.add("=name=" + user);
        words.add("=password=" + pass);
        return words;
    }

    private static List<Object> loginResponse(String user, String challengeHex, String pass) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        md.update(hexToBytes(challengeHex));
        md.update(pass.getBytes(StandardCharsets.UTF_8));
        byte[] digest = md.digest();
        byte[] response = new byte[digest.length + 1];
        response[0] = 0x00;
        System.arraycopy(digest, 0, response, 1, digest.length);
        List<Object> words = new ArrayList<>();
        words.add("/login");
        words.add("=name=" + user);
        words.add(response);
        return words;
    }

    private static byte[] hexToBytes(String h) {
        h = h.replaceAll("[^0-9A-Fa-f]", "");
        byte[] b = new byte[h.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
        return b;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
