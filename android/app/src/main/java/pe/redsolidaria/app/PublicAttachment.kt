package pe.redsolidaria.app

import org.json.JSONObject

// Only consume the public DTO: proofUrl has already passed donor consent checks.
internal fun publicAttachment(row: JSONObject): String {
    if (row.has("proofUrl")) return row.text("proofUrl").takeIf { it.startsWith("https://") }.orEmpty()
    return listOf("receiptUrl", "mediaUrl", "imageUrl").map { row.text(it) }
        .firstOrNull { it.startsWith("https://") }.orEmpty()
}

internal fun publicImage(row: JSONObject): String {
    val url = publicAttachment(row)
    if (url.isBlank()) return ""
    val type = row.text("mediaType").ifBlank { row.text("receiptType") }.lowercase()
    if (type == "pdf" || type == "video" || type == "application/pdf" || type.startsWith("video/")) return ""
    val path = url.substringBefore('?').substringBefore('#').lowercase()
    if (path.endsWith(".pdf") || path.endsWith(".mp4") || path.endsWith(".webm")) return ""
    return url
}
