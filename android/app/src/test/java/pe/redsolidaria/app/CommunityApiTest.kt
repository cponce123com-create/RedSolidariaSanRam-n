package pe.redsolidaria.app

import java.io.IOException
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class CommunityApiTest {
    @Test fun `HTML fallback cannot count as a successful API response`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("<!doctype html><html></html>"))
            try { CommunityApi(server.url("/").toString()).request("notifications"); fail("HTML is not API data") }
            catch (error: IOException) { assertTrue(error.message!!.contains("módulo")) }
        }
    }
    @Test fun `public native screens consume JSON from the shared server`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""[{"id":39,"name":"Rex","species":"perro"}]"""))
            val rows = CommunityApi(server.url("/").toString()).array("pets")
            assertEquals("Rex", rows.single().text("name"))
            assertEquals("/api/pets", server.takeRequest().path)
        }
    }
    @Test fun `forms send JSON and only acknowledge successful server responses`() = runBlocking {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(201).setBody("""{"id":1}"""))
            val api = CommunityApi(server.url("/").toString())
            val result = api.request("contact", JSONObject().put("name", "Prueba").put("message", "Consulta de prueba"))
            assertEquals(1, JSONObject(result).getInt("id"))
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/contact", request.path)
            assertEquals("Prueba", JSONObject(request.body.readUtf8()).getString("name"))
            server.enqueue(MockResponse().setResponseCode(409).setBody("""{"message":"Ya existe una postulación con este correo."}"""))
            try { api.request("volunteers", JSONObject()); fail("A failed submission cannot appear successful") }
            catch (error: IOException) { assertTrue(error.message!!.contains("Ya existe")) }
        }
    }
}
