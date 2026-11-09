package pe.redsolidaria.app

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun HomeScreen(padding: PaddingValues, campaigns: CampaignViewModel, community: CommunityViewModel,
    navigate: (String) -> Unit, openCampaign: (Int) -> Unit, donate: () -> Unit) {
    val state by campaigns.state.collectAsStateWithLifecycle()
    val identity by community.identity.collectAsStateWithLifecycle()
    val cms by community.cms.collectAsStateWithLifecycle()
    val feeds by community.feeds.collectAsStateWithLifecycle()
    val stats by community.stats.collectAsStateWithLifecycle()
    val settings by community.settings.collectAsStateWithLifecycle()
    val active = state.campaigns.filter { it.status == "active" }
    val protagonist = active.firstOrNull { it.id == settings.optInt("protagonist_campaign_id") } ?: active.firstOrNull()
    val page = cms["inicio"]
    LaunchedEffect(Unit) { campaigns.load("all") }
    RefreshWhileVisible("home-cms") { community.loadCms("inicio") }
    LazyColumn(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(28.dp),
        contentPadding = PaddingValues(bottom = 32.dp)) {
        val cover = identity?.optJSONObject("cover")?.let { it.text("mobileUrl").ifBlank { it.text("desktopUrl") } }
        if (!cover.isNullOrBlank()) item {
            BrandPhoto(cover, "Portada institucional de Red Solidaria", Modifier.fillMaxWidth().height(126.dp))
        }
        item {
            Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(MaterialTheme.colorScheme.secondaryContainer,
                MaterialTheme.colorScheme.background))).padding(horizontal = 22.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)) {
                Surface(color = MaterialTheme.colorScheme.surface, shape = CircleShape, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    Box(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) { Eyebrow(cmsField(page, "hero", "eyebrow", "San Ramón · Chanchamayo · Selva Central")) }
                }
                Column {
                    Text(cmsField(page, "hero", "title", "Red Solidaria"), fontFamily = Outfit, fontSize = 42.sp, lineHeight = 45.sp, fontWeight = FontWeight.Bold)
                    Text(cmsField(page, "hero", "titleAccent", "San Ramón"), fontFamily = Outfit, fontSize = 42.sp, lineHeight = 45.sp,
                        fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }
                Text(cmsField(page, "hero", "subtitle", "Cuando alguien necesita ayuda, la comunidad responde."),
                    fontFamily = Outfit, fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold)
                Text("Una red de personas que se unen para ayudar a familias, niños y animales de nuestra comunidad.",
                    style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    BrandAction("Quiero ayudar", Icons.Outlined.VolunteerActivism, Modifier.fillMaxWidth()) { navigate("help") }
                    BrandAction("Necesito ayuda", Icons.Outlined.Support, Modifier.fillMaxWidth(), outlined = true) { navigate("report") }
                    TextButton(onClick = { navigate("transparency") }, modifier = Modifier.fillMaxWidth()) {
                        Text("Consultar transparencia"); Spacer(Modifier.width(8.dp)); Icon(Icons.Outlined.ArrowForward, null, Modifier.size(16.dp))
                    }
                }
                val cmsHero = page?.list("blocks")?.firstOrNull { it.text("id") == "hero" }
                    ?.optJSONObject("fields")?.optJSONObject("image")?.text("url")?.ifBlank { null }
                Card(shape = RoundedCornerShape(24.dp), elevation = CardDefaults.cardElevation(5.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    BrandPhoto(cmsHero ?: R.drawable.hero_comunidad, "Actividad de Red Solidaria San Ramón en la comunidad",
                        Modifier.fillMaxWidth().aspectRatio(4f / 3f))
                }
                Eyebrow("La red en acción · San Ramón, Chanchamayo", MaterialTheme.colorScheme.onSurfaceVariant)
                HorizontalDivider()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column { Text(stats?.let { money(it.optDouble("totalAmount", 0.0)) } ?: "—", fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 23.sp); Text("Recaudado", style = MaterialTheme.typography.bodySmall) }
                    Column { Text(if (state.loading || state.error != null) "—" else active.size.toString(), fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 23.sp); Text("Campañas en curso", style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        if (state.loading && state.campaigns.isEmpty()) item { LoadingBlock("Consultando las campañas de la comunidad…") }
        state.error?.let { error -> item { Box(Modifier.padding(horizontal = 22.dp)) { ErrorBlock(error) { campaigns.load("all") } } } }
        protagonist?.let { campaign -> item {
            Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Eyebrow("Campaña protagonista")
                CampaignTile(campaign, featured = true) { openCampaign(campaign.id) }
            }
        } }
        item {
            Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                SectionTitle("Hay muchas formas de ayudar", "No necesitas hacer mucho. Compartir, donar o estar presente puede cambiar una historia.")
                val actions = listOf(Triple("Donar", "Ayuda a una campaña", Icons.Outlined.FavoriteBorder),
                    Triple("Donar productos", "Alimentos, ropa y útiles", Icons.Outlined.Inventory2),
                    Triple("Ser voluntario", "Tu tiempo también ayuda", Icons.Outlined.Groups),
                    Triple("Ayudar a un animal", "Adopción y rescate", Icons.Outlined.Pets))
                actions.chunked(2).forEachIndexed { row, cells ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        cells.forEachIndexed { column, (title, subtitle, icon) ->
                            val index = row * 2 + column
                            OutlinedCard(onClick = { when (index) { 0 -> donate(); 1 -> navigate("help"); 2 -> navigate("volunteer"); else -> navigate("pets") } },
                                modifier = Modifier.weight(1f), shape = RoundedCornerShape(20.dp)) {
                                Column(Modifier.fillMaxWidth().padding(16.dp).heightIn(min = 126.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.secondaryContainer) {
                                        Icon(icon, null, Modifier.padding(11.dp).size(25.dp), tint = MaterialTheme.colorScheme.primary)
                                    }
                                    Text(title, fontWeight = FontWeight.Bold, fontFamily = Outfit, fontSize = 17.sp)
                                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                SectionTitle("Personas que hoy necesitan de nosotros", "Cada campaña es una historia real de nuestra comunidad.", "Ver todas") { navigate("campaigns") }
                active.filter { it.id != protagonist?.id }.take(2).forEach { campaign -> CampaignTile(campaign) { openCampaign(campaign.id) } }
                if (active.isEmpty() && !state.loading && state.error == null) EmptyBlock("Pronto habrá nuevas campañas", "Mientras tanto, puedes ayudar de otras formas.")
                if (active.size == 1) OutlinedButton(onClick = { navigate("campaigns") }, modifier = Modifier.fillMaxWidth()) { Text("Ver campañas y resultados anteriores") }
            }
        }
        val urgent = feeds["urgent"] ?: CommunityFeed(loading = true)
        item {
            Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Eyebrow("Casos que necesitan ayuda ahora", Color(0xFFB55328))
                SectionTitle("Tu ayuda puede cambiar una historia", action = "Ver casos") { navigate("urgent") }
                if (urgent.loading) LoadingBlock()
                urgent.error?.let { ErrorBlock(it) { community.load("urgent", "reports/urgent") } }
                urgent.rows.take(2).forEach { UrgentCard(it) { navigate("urgent") } }
                if (!urgent.loading && urgent.error == null && urgent.rows.isEmpty()) Text("No hay casos urgentes publicados en este momento.")
            }
        }
        item {
            Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer).padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Eyebrow("Recibimos · Ejecutamos · Rendimos cuentas")
                Text("Tu ayuda tiene rostro y destino.", style = MaterialTheme.typography.headlineLarge)
                Text("Queremos que sepas qué hacemos con cada aporte. Consulta los movimientos, los gastos publicados y la rendición de cada campaña.")
                BrandAction("Ver transparencia", Icons.Outlined.VerifiedUser, Modifier.fillMaxWidth()) { navigate("transparency") }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                BrandPhoto(R.drawable.historia_red, "Voluntarios de Red Solidaria", Modifier.fillMaxWidth().height(225.dp).clip(RoundedCornerShape(22.dp)), fallback = R.drawable.historia_red)
                Eyebrow("Nuestra historia · San Ramón, Chanchamayo")
                SectionTitle("Somos una red, no solo una página.")
                Text("Todo comenzó con amigos que se unieron para llevar juguetes y una chocolatada a los niños. Hoy la red acompaña a familias y animales de nuestra comunidad.")
                TextButton(onClick = { navigate("about") }) { Text("Conocer nuestra historia"); Icon(Icons.Outlined.ArrowForward, null) }
            }
        }
        val pets = feeds["pets"] ?: CommunityFeed(loading = true)
        item {
            Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SectionTitle("Ellos también esperan una familia", action = "Ver todos") { navigate("pets") }
                pets.rows.take(4).chunked(2).forEach { row -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { pet -> PetTile(pet, Modifier.weight(1f), compact = true) { navigate("pet/${pet.optInt("id")}") } }
                } }
                pets.error?.let { ErrorBlock(it) { community.load("pets", "pets") } }
                if (!pets.loading && pets.error == null && pets.rows.isEmpty()) Text("Pronto publicaremos nuevas historias de adopción.")
            }
        }
        item {
            Card(Modifier.padding(horizontal = 22.dp), colors = CardDefaults.cardColors(containerColor = BrandGreen), shape = RoundedCornerShape(24.dp)) {
                Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    Icon(Icons.Outlined.VolunteerActivism, null, tint = Color.White, modifier = Modifier.size(34.dp))
                    Text("La solidaridad también necesita personas.", color = Color.White, style = MaterialTheme.typography.headlineMedium)
                    Text("Tu tiempo, tus manos y tu compañía valen más de lo que imaginas.", color = Color.White.copy(alpha = .85f))
                    FilledTonalButton(onClick = { navigate("volunteer") }) { Text("Quiero ser voluntario") }
                }
            }
        }
        item { Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Eyebrow("Red Solidaria San Ramón")
            Text("Una comunidad cambia cuando decide no mirar hacia otro lado.", fontFamily = Outfit, fontWeight = FontWeight.SemiBold, fontSize = 22.sp)
            Text("San Ramón · Chanchamayo · Junín, Perú", style = MaterialTheme.typography.bodySmall)
            Text("Versión ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall)
        } }
    }
}
