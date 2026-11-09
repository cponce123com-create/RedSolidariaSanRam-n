package pe.redsolidaria.app

import java.io.IOException
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CampaignRepositoryTest {
    private val campaign = """{"id":7,"title":"Ayuda comunitaria","description":"Descripción real",
        "imageUrl":"/images/campaign.jpg","goal":100,"raised":120,"verifiedRaised":90,
        "historicalRaised":30,"donorCount":4,"status":"active","category":"salud"}"""

    @Test fun `list uses real API contract and pagination`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("[$campaign]"))
            val result = CampaignRepository(server.url("/")).page("active", 20)
            assertEquals("/api/campaigns?status=active&limit=20&offset=20", server.takeRequest().path)
            assertEquals(7, result.single().id)
            assertEquals(120.0, result.single().raised, 0.0)
            assertEquals(90.0, result.single().verifiedRaised, 0.0)
        }
    }

    @Test fun `detail is fetched independently`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody(campaign))
            assertEquals(7, CampaignRepository(server.url("/")).detail(7).id)
            assertEquals("/api/campaigns/7", server.takeRequest().path)
        }
    }

    @Test fun `missing campaign produces an actionable error`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(404))
            try {
                CampaignRepository(server.url("/")).detail(7)
                fail("Expected IOException")
            } catch (error: IOException) { assertTrue(error.message!!.contains("no está disponible")) }
        }
    }

    @Test fun `empty list is a successful response`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("[]"))
            assertTrue(CampaignRepository(server.url("/")).page("all", 0).isEmpty())
        }
    }

    @Test fun `relative media uses server and progress handles zero goals`() {
        val json = JSONObject(campaign)
        val parsed = parseCampaign(json, "https://example.org/".toHttpUrl())
        assertEquals("https://example.org/images/campaign.jpg", parsed.imageUrl)
        assertEquals(1f, parsed.progress)
        assertEquals(0f, parsed.copy(goal = 0.0).progress)
        assertEquals(0f, parsed.copy(raised = -10.0).progress)
        assertEquals(null, parseCampaign(json.put("imageUrl", JSONObject.NULL), "https://example.org/".toHttpUrl()).imageUrl)
        assertEquals(null, parseCampaign(json.put("imageUrl", "http://example.org/photo"), "https://example.org/".toHttpUrl()).imageUrl)
    }
}
