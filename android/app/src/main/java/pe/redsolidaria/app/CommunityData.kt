package pe.redsolidaria.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class CommunityFeed(val rows: List<JSONObject> = emptyList(), val loading: Boolean = false,
    val error: String? = null, val hasMore: Boolean = false)

class CommunityApi(private val baseUrl: String = BuildConfig.API_BASE_URL) {
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS).callTimeout(75, TimeUnit.SECONDS).build()
    suspend fun request(path: String, body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        require(!path.startsWith("/") && !path.contains("://"))
        val builder = Request.Builder().url(baseUrl + "api/" + path)
            .header("Accept", "application/json")
        if (body != null) builder.header("Origin", baseUrl.trimEnd('/'))
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string() ?: throw IOException("El servidor respondió sin datos.")
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(text).optString("message").ifBlank { JSONObject(text).optString("error") } }.getOrDefault("")
                throw IOException(message.ifBlank { "No se pudo completar la solicitud (${response.code})." })
            }
            if (text.trimStart().startsWith("<")) throw IOException("El servidor no entregó los datos esperados. Es posible que falte publicar este módulo.")
            text
        }
    }
    suspend fun array(path: String): List<JSONObject> {
        val array = JSONArray(request(path))
        return List(array.length()) { array.getJSONObject(it) }
    }
    suspend fun obj(path: String): JSONObject? = request(path).let { if (it.trim() == "null") null else JSONObject(it) }
}

class CommunityViewModel : ViewModel() {
    val api = CommunityApi()
    private val mutableFeeds = MutableStateFlow<Map<String, CommunityFeed>>(emptyMap())
    val feeds = mutableFeeds.asStateFlow()
    private val mutableIdentity = MutableStateFlow<JSONObject?>(null)
    val identity = mutableIdentity.asStateFlow()
    private val mutableSettings = MutableStateFlow(JSONObject())
    val settings = mutableSettings.asStateFlow()
    private val mutableStats = MutableStateFlow<JSONObject?>(null)
    val stats = mutableStats.asStateFlow()
    private val mutableCms = MutableStateFlow<Map<String, JSONObject?>>(emptyMap())
    val cms = mutableCms.asStateFlow()
    private val mutableMetadataErrors = MutableStateFlow<Map<String, String>>(emptyMap())
    val metadataErrors = mutableMetadataErrors.asStateFlow()

    // loadMetadata() reads this cache synchronously during construction.
    private val cmsLoadedAt = mutableMapOf<String, Long>()

    init {
        loadMetadata()
        load("urgent", "reports/urgent")
        load("pets", "pets")
        load("news", "news?limit=20&offset=0")
    }

    fun loadMetadata() {
        fun load(key: String, assign: (JSONObject?) -> Unit) = viewModelScope.launch {
            try { assign(api.obj(key)); mutableMetadataErrors.value = mutableMetadataErrors.value - key }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { mutableMetadataErrors.value = mutableMetadataErrors.value + (key to (failure.message ?: "No se pudo actualizar la información.")) }
        }
        load("institutional-identity") { mutableIdentity.value = it }
        load("settings") { mutableSettings.value = it ?: JSONObject() }
        load("donations/stats") { mutableStats.value = it }
        loadCms("inicio")
    }

    fun loadCms(slug: String) {
        if (System.nanoTime() - (cmsLoadedAt[slug] ?: 0L) < 60_000_000_000L && mutableCms.value.containsKey(slug)) return
        viewModelScope.launch {
            try {
                mutableCms.value = mutableCms.value + (slug to api.obj("cms/pages/$slug"))
                cmsLoadedAt[slug] = System.nanoTime()
            }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { /* Public pages retain the same fallback as the web. */ }
        }
    }

    fun load(key: String, path: String, append: Boolean = false) {
        if (mutableFeeds.value[key]?.loading == true) return
        val previous = mutableFeeds.value[key] ?: CommunityFeed()
        mutableFeeds.value = mutableFeeds.value + (key to previous.copy(loading = true, error = null))
        viewModelScope.launch {
            try {
                val rows = api.array(path)
                val merged = if (append) (previous.rows + rows).distinctBy { it.optInt("id") } else rows
                mutableFeeds.value = mutableFeeds.value + (key to CommunityFeed(merged, hasMore = rows.size == 20))
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) { mutableFeeds.value = mutableFeeds.value + (key to previous.copy(error = error.message ?: "No hay conexión.")) }
        }
    }

    fun loadLedger(append: Boolean = false) {
        val key = "ledger"
        if (mutableFeeds.value[key]?.loading == true) return
        val previous = mutableFeeds.value[key] ?: CommunityFeed()
        mutableFeeds.value = mutableFeeds.value + (key to previous.copy(loading = true, error = null))
        viewModelScope.launch {
            try {
                val offset = if (append) previous.rows.size else 0
                val data = requireNotNull(api.obj("transparency/ledger?limit=20&offset=$offset"))
                val array = data.getJSONArray("entries")
                val rows = List(array.length()) { array.getJSONObject(it) }
                // Public income and expense IDs can overlap, so preserve both.
                val merged = if (append) previous.rows + rows else rows
                mutableFeeds.value = mutableFeeds.value + (key to CommunityFeed(merged, hasMore = offset + rows.size < data.optInt("total")))
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) { mutableFeeds.value = mutableFeeds.value + (key to previous.copy(error = error.message ?: "No hay conexión.")) }
        }
    }
}

fun JSONObject.text(key: String): String = optString(key).takeUnless { it == "null" } ?: ""
fun JSONObject.list(key: String): List<JSONObject> = optJSONArray(key)?.let { array ->
    List(array.length()) { array.optJSONObject(it) ?: JSONObject() }
} ?: emptyList()
fun JSONObject.strings(key: String): List<String> = optJSONArray(key)?.let { array ->
    List(array.length()) { array.optString(it) }.filter { it.isNotBlank() }
} ?: emptyList()
fun bilingual(value: Any?): String = when (value) {
    is JSONObject -> value.text("es").ifBlank { value.text("en") }
    is String -> value
    else -> ""
}
fun cmsField(page: JSONObject?, block: String, key: String, fallback: String): String =
    page?.list("blocks")?.firstOrNull { it.text("id") == block && it.optBoolean("enabled", true) }
        ?.optJSONObject("fields")?.opt(key)?.let(::bilingual)?.ifBlank { fallback } ?: fallback
