package pe.redsolidaria.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.*
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

data class Notice(val id: Long, val key: String, val category: String, val title: String,
    val body: String, val campaignId: Int?, val path: String, val read: Boolean = false)

internal fun parseNotices(raw: String): List<Notice> {
    val rows = JSONObject(raw).getJSONArray("items")
    return List(rows.length()) { index ->
        val row = rows.getJSONObject(index)
        val category = row.getString("category")
        require(category in NOTICE_CATEGORIES.keys)
        val campaignId = if (row.isNull("campaignId")) null else row.getInt("campaignId").also { require(it > 0) }
        val path = if (category == "urgent") "/casos-urgentes" else "/campanas/${requireNotNull(campaignId)}"
        Notice(row.getLong("id"), row.getString("key"), category, row.getString("title"),
            row.getString("body"), campaignId, path, row.optBoolean("read", false))
    }
}

val NOTICE_CATEGORIES = linkedMapOf("campaign" to "Nuevas campañas", "donation" to "Aportes confirmados",
    "urgent" to "Casos urgentes", "result" to "Resultados y cierres")

object NoticeStore {
    private val lock = Mutex()
    private val mutableItems = MutableStateFlow<List<Notice>>(emptyList())
    val items = mutableItems.asStateFlow()
    private val mutableCategories = MutableStateFlow(NOTICE_CATEGORIES.keys.toSet())
    val categories = mutableCategories.asStateFlow()
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS).callTimeout(75, TimeUnit.SECONDS).build()
    private fun prefs(context: Context) = context.getSharedPreferences("important_notices", Context.MODE_PRIVATE)

    fun initialize(context: Context) {
        mutableCategories.value = NOTICE_CATEGORIES.keys.filter { enabled(context, it) }.toSet()
        val raw = prefs(context).getString("history", null) ?: return
        mutableItems.value = runCatching { parseNotices(raw) }.getOrDefault(emptyList())
    }

    fun enabled(context: Context, category: String) = prefs(context).getBoolean("category_$category", true)
    fun alertsEnabled(context: Context) = prefs(context).getBoolean("alerts_enabled", false)
    fun setCategory(context: Context, category: String, enabled: Boolean) {
        require(category in NOTICE_CATEGORIES)
        prefs(context).edit().putBoolean("category_$category", enabled).apply()
        mutableCategories.value = if (enabled) mutableCategories.value + category else mutableCategories.value - category
        if (!enabled) items.value.filter { it.category == category }.forEach { NotificationManagerCompat.from(context).cancel(it.key.hashCode()) }
    }
    fun setAlerts(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean("alerts_enabled", enabled).apply()
        val manager = WorkManager.getInstance(context)
        if (enabled) {
            val work = PeriodicWorkRequestBuilder<NoticeWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            manager.enqueueUniquePeriodicWork("important-notices", ExistingPeriodicWorkPolicy.KEEP, work)
        } else {
            manager.cancelUniqueWork("important-notices")
            NotificationManagerCompat.from(context).cancelAll()
        }
    }

    suspend fun markRead(context: Context, key: String? = null) = lock.withLock {
        mutableItems.value = mutableItems.value.map { if (key == null || it.key == key) it.copy(read = true) else it }
        persist(context)
        if (key == null) NotificationManagerCompat.from(context).cancelAll()
        else NotificationManagerCompat.from(context).cancel(key.hashCode())
    }

    private fun persist(context: Context) {
        val rows = JSONArray()
        mutableItems.value.forEach { n -> rows.put(JSONObject().put("id", n.id).put("key", n.key)
            .put("category", n.category).put("title", n.title).put("body", n.body)
            .put("campaignId", n.campaignId ?: JSONObject.NULL).put("path", n.path).put("read", n.read)) }
        prefs(context).edit().putString("history", JSONObject().put("items", rows).toString()).apply()
    }

    suspend fun sync(context: Context, showSystemAlerts: Boolean) = withContext(Dispatchers.IO) {
        lock.withLock {
            val request = Request.Builder().url("${BuildConfig.API_BASE_URL}api/notifications").build()
            val incoming = client.newCall(request).execute().use { response ->
                if (response.code == 404) throw IOException("El servidor aún no tiene publicado el módulo de avisos.")
                if (!response.isSuccessful) throw IOException("El servidor no pudo cargar los avisos (${response.code}).")
                val body = response.body?.string() ?: throw IOException("Respuesta vacía")
                if (body.trimStart().startsWith("<")) throw IOException("El servidor aún no tiene publicado el módulo de avisos.")
                parseNotices(body)
            }
            val settings = prefs(context)
            val initialized = settings.getBoolean("initialized", false)
            val previous = mutableItems.value.associateBy { it.key }
            val lastId = settings.getLong("last_id", 0)
            val merged = incoming.map { item ->
                item.copy(read = !initialized || (previous[item.key]?.let { it.read && it.id == item.id } ?: false))
            }
            // Replace with the server snapshot: revoked/private events disappear.
            mutableItems.value = merged
            persist(context)
            if (initialized && showSystemAlerts && alertsEnabled(context)) {
                merged.filter { it.id > lastId && !it.read && enabled(context, it.category) }.forEach { notify(context, it) }
            }
            settings.edit().putBoolean("initialized", true)
                .putLong("last_id", maxOf(lastId, incoming.maxOfOrNull { it.id } ?: 0)).apply()
        }
    }

    private fun notify(context: Context, notice: Notice) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val channelId = "important_${notice.category}"
        manager.createNotificationChannel(NotificationChannel(channelId, NOTICE_CATEGORIES.getValue(notice.category),
            if (notice.category == "urgent") NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT))
        val intent = Intent(context, MainActivity::class.java).putExtra("notice_campaign", notice.campaignId ?: 0)
            .putExtra("notice_key", notice.key)
        val pending = PendingIntent.getActivity(context, notice.key.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(notice.title).setContentText(notice.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notice.body)).setContentIntent(pending)
            .setAutoCancel(true).setOnlyAlertOnce(true).setNumber(items.value.count { !it.read })
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
        NotificationManagerCompat.from(context).notify(notice.key.hashCode(), notification)
    }
}

class NoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (!NoticeStore.alertsEnabled(applicationContext)) return Result.success()
        return try {
            NoticeStore.initialize(applicationContext)
            NoticeStore.sync(applicationContext, true)
            Result.success()
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { Result.retry() }
    }
}
