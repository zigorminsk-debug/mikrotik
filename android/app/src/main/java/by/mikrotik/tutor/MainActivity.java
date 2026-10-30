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
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Оболочка приложения: WebView загружает общий веб-контент учебника
 * из assets (app/index.html). Всё работает офлайн.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";
    private WebView webView;

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

        // Register before loading the page so the bridge is present when JS starts.
        // Только GitHub API; никаких произвольных URL или системных команд.
        webView.addJavascriptInterface(new GithubBridge(), "Android");

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(START_URL);
        }
    }

    /**
     * Небольшой HTTP-клиент, доступный из JavaScript.
     * Вызывается из фонового потока WebView, сеть там разрешена.
     */
    public class GithubBridge {
        private static final String ALLOW_PREFIX =
                "https://api.github.com/repos/zigorminsk-debug/mikrotik/";

        // Separate thread prevents an offline update check from freezing WebView.
        @JavascriptInterface
        public void httpGetAsync(String url, String requestId) {
            if (requestId == null || !requestId.matches("u[0-9]{1,10}") ||
                    !"https://api.github.com/repos/zigorminsk-debug/mikrotik/releases/latest".equals(url)) return;
            new Thread(() -> {
                String response = httpGet(url);
                WebView view = webView;
                if (view == null) return;
                view.post(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    String script = "window.onNativeUpdateResponse && window.onNativeUpdateResponse(" +
                            JSONObject.quote(requestId) + "," + (response == null ? "null" : JSONObject.quote(response)) + ")";
                    view.evaluateJavascript(script, null);
                });
            }, "release-check").start();
        }

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
                // A just-published release must not be hidden by a cached response.
                conn.setUseCaches(false);
                conn.setRequestProperty("Cache-Control", "no-cache");
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
                    if (sb.length() > 2_000_000) return null;
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
