package pe.redsolidaria.app

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PublicAttachmentTest {
    @Test fun `approved donor proof uses the public field`() {
        val row = JSONObject().put("proofUrl", "https://example.org/proof.jpg")
        assertEquals("https://example.org/proof.jpg", publicAttachment(row))
    }
    @Test fun `revoked public proof cannot fall back to a raw receipt`() {
        val row = JSONObject().put("proofUrl", JSONObject.NULL).put("receiptUrl", "https://example.org/private.jpg")
        assertEquals("", publicAttachment(row))
        assertEquals("", publicImage(row))
    }
    @Test fun `evidence images display while pdfs stay as links`() {
        val row = JSONObject().put("mediaUrl", "https://example.org/photo").put("mediaType", "image")
        assertEquals("https://example.org/photo", publicImage(row))
        row.put("mediaType", "pdf")
        assertEquals("", publicImage(row))
        assertEquals("https://example.org/photo", publicAttachment(row))
        assertEquals("", publicImage(JSONObject().put("receiptUrl", "https://example.org/document.PDF?download=1")))
    }
    @Test fun `untrusted link schemes are not actionable`() {
        assertEquals("", publicAttachment(JSONObject().put("proofUrl", "javascript:alert(1)")))
    }
}
