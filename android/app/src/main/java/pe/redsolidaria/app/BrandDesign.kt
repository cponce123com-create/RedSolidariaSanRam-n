package pe.redsolidaria.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.Html
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import java.text.NumberFormat
import java.util.Locale

val BrandGreen = Color(0xFF238B34)
val BrandInk = Color(0xFF18201B)
val BrandCream = Color(0xFFF9FAF8)
val BrandMint = Color(0xFFEBF6ED)
val BrandGold = Color(0xFFE8B64E)
val Outfit = FontFamily(Font(R.font.outfit))
val DmSans = FontFamily(Font(R.font.dm_sans))

@Composable
fun BrandTheme(dark: Boolean, content: @Composable () -> Unit) {
    val colors = if (dark) darkColorScheme(primary = Color(0xFF8BD99B), background = Color(0xFF101B13),
        surface = Color(0xFF17251B), secondaryContainer = Color(0xFF233B2A))
    else lightColorScheme(primary = BrandGreen, onPrimary = Color.White, background = BrandCream,
        surface = Color.White, onSurface = BrandInk, secondaryContainer = BrandMint, outlineVariant = Color(0xFFDDE6DE))
    val typography = Typography().run { copy(
        displaySmall = displaySmall.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
        headlineLarge = headlineLarge.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
        headlineMedium = headlineMedium.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
        titleLarge = titleLarge.copy(fontFamily = Outfit, fontWeight = FontWeight.Bold),
        titleMedium = titleMedium.copy(fontFamily = Outfit, fontWeight = FontWeight.SemiBold),
        bodyLarge = bodyLarge.copy(fontFamily = DmSans, lineHeight = 25.sp),
        bodyMedium = bodyMedium.copy(fontFamily = DmSans, lineHeight = 22.sp),
        bodySmall = bodySmall.copy(fontFamily = DmSans),
        labelLarge = labelLarge.copy(fontFamily = DmSans, fontWeight = FontWeight.Bold),
        labelMedium = labelMedium.copy(fontFamily = DmSans),
        labelSmall = labelSmall.copy(fontFamily = DmSans)) }
    MaterialTheme(colorScheme = colors, typography = typography,
        shapes = Shapes(medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(24.dp)), content = content)
}

@Composable
fun BrandPhoto(model: Any?, description: String, modifier: Modifier = Modifier,
    fallback: Int = R.drawable.hero_comunidad, scale: ContentScale = ContentScale.Crop) {
    AsyncImage(model = model, contentDescription = description, contentScale = scale, modifier = modifier,
        placeholder = painterResource(fallback), error = painterResource(fallback), fallback = painterResource(fallback))
}

@Composable
fun Eyebrow(text: String, color: Color = MaterialTheme.colorScheme.primary) {
    Text(text.uppercase(Locale("es", "PE")), color = color, fontFamily = DmSans,
        fontWeight = FontWeight.Bold, fontSize = 10.sp, letterSpacing = 1.7.sp)
}

@Composable
fun SectionTitle(title: String, subtitle: String? = null, action: String? = null, onAction: () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            if (action != null) TextButton(onClick = onAction) { Text(action, fontSize = 12.sp) }
        }
        if (!subtitle.isNullOrBlank()) Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun BrandAction(text: String, icon: ImageVector, modifier: Modifier = Modifier, outlined: Boolean = false, onClick: () -> Unit) {
    if (outlined) OutlinedButton(onClick = onClick, modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .25f))) {
        Icon(icon, null, Modifier.size(19.dp)); Spacer(Modifier.width(8.dp)); Text(text)
    } else Button(onClick = onClick, modifier = modifier.heightIn(min = 52.dp), shape = RoundedCornerShape(14.dp)) {
        Icon(icon, null, Modifier.size(19.dp)); Spacer(Modifier.width(8.dp)); Text(text)
    }
}

@Composable
fun CampaignTile(campaign: Campaign, modifier: Modifier = Modifier, featured: Boolean = false, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), elevation = CardDefaults.cardElevation(2.dp)) {
        Box {
            BrandPhoto(campaign.imageUrl, campaign.title, Modifier.fillMaxWidth().height(if (featured) 220.dp else 190.dp))
            Surface(Modifier.padding(14.dp), color = if (campaign.status == "active") BrandGreen else Color(0xFF455B4A), shape = CircleShape) {
                Text(if (campaign.status == "active") "EN CURSO" else if (campaign.status == "completed") "FINALIZADA" else "EN PAUSA",
                    Modifier.padding(horizontal = 12.dp, vertical = 7.dp), fontSize = 10.sp, color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (featured) Eyebrow("Campaña protagonista")
            Text(campaign.title, style = MaterialTheme.typography.titleLarge)
            Text(plainText(campaign.description), maxLines = 3, overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            CampaignFunding(campaign)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Conocer la campaña", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Icon(Icons.Outlined.ArrowForward, null, tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun CampaignFunding(campaign: Campaign) {
    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(money(campaign.raised), fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text("${(campaign.progress * 100).toInt()}%", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
        LinearProgressIndicator(progress = { campaign.progress }, modifier = Modifier.fillMaxWidth().height(7.dp).clip(CircleShape),
            trackColor = MaterialTheme.colorScheme.secondaryContainer)
        Text("Recaudado · Meta ${money(campaign.goal)}", style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun LoadingBlock(label: String = "Cargando información de la red…") {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)) { CircularProgressIndicator(); Text(label) }
}

@Composable
fun ErrorBlock(message: String, retry: () -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Outlined.WifiOff, null, tint = MaterialTheme.colorScheme.error)
            Text(message, color = MaterialTheme.colorScheme.error)
            OutlinedButton(onClick = retry) { Text("Reintentar") }
        }
    }
}

@Composable
fun EmptyBlock(title: String, message: String) {
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(20.dp)).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Outlined.FavoriteBorder, null, tint = MaterialTheme.colorScheme.primary)
        Text(title, fontWeight = FontWeight.Bold); Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

fun money(amount: Double): String = NumberFormat.getCurrencyInstance(Locale("es", "PE")).format(amount)
fun plainText(html: String): String = Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString().trim()
fun openWeb(context: Context, path: String) {
    val uri = Uri.parse(if (path.startsWith("https://")) path else BuildConfig.API_BASE_URL.trimEnd('/') + "/" + path.trimStart('/'))
    if (uri.scheme == "https") context.startActivity(Intent(Intent.ACTION_VIEW, uri))
}
