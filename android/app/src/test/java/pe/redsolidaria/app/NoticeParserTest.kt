package pe.redsolidaria.app

import org.junit.Assert.*
import org.junit.Test

class NoticeParserTest {
    @Test fun `server cannot inject external links into a campaign alert`() {
        val notice = parseNotices("""{"items":[{"id":1,"key":"campaign:7","category":"campaign",
            "title":"Nueva campaña","body":"Ayuda","campaignId":7,"path":"https://evil.example"}]}""").single()
        assertEquals("/campanas/7", notice.path)
        assertFalse(notice.read)
    }
    @Test fun `urgent alerts always open the approved public cases page`() {
        val notice = parseNotices("""{"items":[{"id":2,"key":"urgent:1","category":"urgent",
            "title":"Urgente","body":"Caso aprobado","campaignId":null,"path":"/admin","read":true}]}""").single()
        assertEquals("/casos-urgentes", notice.path)
        assertTrue(notice.read)
    }
    @Test fun `empty history is valid`() { assertTrue(parseNotices("""{"items":[]}""").isEmpty()) }
    @Test(expected = IllegalArgumentException::class) fun `unknown categories are rejected`() {
        parseNotices("""{"items":[{"id":1,"key":"x","category":"private"}]}""")
    }
}
