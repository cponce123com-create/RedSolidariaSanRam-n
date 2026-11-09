package pe.redsolidaria.app

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject

data class Campaign(
    val id: Int,
    val title: String,
    val description: String,
    val imageUrl: String?,
    val goal: Double,
    val raised: Double,
    val verifiedRaised: Double,
    val historicalRaised: Double,
    val donorCount: Int,
    val status: String,
    val category: String,
) {
    val progress: Float get() = if (goal > 0) (raised / goal).toFloat().coerceIn(0f, 1f) else 0f
}

internal fun parseCampaign(json: JSONObject, baseUrl: HttpUrl): Campaign = Campaign(
    id = json.getInt("id"),
    title = json.getString("title"),
    description = json.getString("description"),
    imageUrl = json.optString("imageUrl").takeIf { it.isNotBlank() && it != "null" }
        ?.let { baseUrl.resolve(it) }?.takeIf { it.isHttps }?.toString(),
    goal = json.getDouble("goal"),
    raised = json.getDouble("raised"),
    verifiedRaised = json.getDouble("verifiedRaised"),
    historicalRaised = json.getDouble("historicalRaised"),
    donorCount = json.getInt("donorCount"),
    status = json.getString("status"),
    category = json.getString("category"),
)

class CampaignRepository(
    private val baseUrl: HttpUrl = BuildConfig.API_BASE_URL.toHttpUrl(),
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(75, TimeUnit.SECONDS).build(),
) {
    private fun get(path: String): String {
        val url = requireNotNull(baseUrl.resolve(path))
        return client.newCall(Request.Builder().url(url).header("Accept", "application/json").build())
            .execute().use { response ->
                if (!response.isSuccessful) throw IOException(
                    if (response.code == 404) "La campaña ya no está disponible."
                    else "El servidor no pudo responder (${response.code}). Intenta nuevamente."
                )
                response.body?.string() ?: throw IOException("El servidor respondió sin datos.")
            }
    }

    suspend fun page(status: String, offset: Int): List<Campaign> = withContext(Dispatchers.IO) {
        require(status in setOf("all", "active", "completed"))
        require(offset >= 0)
        val data = JSONArray(get("api/campaigns?status=$status&limit=$PAGE_SIZE&offset=$offset"))
        List(data.length()) { parseCampaign(data.getJSONObject(it), baseUrl) }
    }

    suspend fun detail(id: Int): Campaign = withContext(Dispatchers.IO) {
        require(id > 0)
        parseCampaign(JSONObject(get("api/campaigns/$id")), baseUrl)
    }

    companion object { const val PAGE_SIZE = 20 }
}
