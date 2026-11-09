package pe.redsolidaria.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import org.json.JSONObject

@Composable
fun CampaignListScreen(padding: PaddingValues, state: CampaignState, model: CampaignViewModel) {
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { SectionTitle("Campañas solidarias", "Cada campaña es una historia real. Conoce cómo puedes ayudar.") }
        item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("all" to "Todas", "active" to "En curso", "completed" to "Finalizadas").forEach { (value, label) ->
                FilterChip(selected = state.filter == value, onClick = { model.load(value) }, label = { Text(label) })
            }
        } }
        item { TextButton(onClick = { model.load() }, enabled = !state.loading) { Icon(Icons.Outlined.Refresh, null); Text("Actualizar campañas") } }
        items(state.campaigns, key = { it.id }) { campaign -> CampaignTile(campaign) { model.open(campaign.id) } }
        if (state.loading) item { LoadingBlock() }
        state.error?.let { error -> item { ErrorBlock(error) { model.load(append = state.campaigns.isNotEmpty()) } } }
        if (!state.loading && state.error == null && state.campaigns.isEmpty()) item { EmptyBlock("No hay campañas en este filtro", "Prueba con Todas o vuelve más tarde.") }
        if (state.hasMore && !state.loading && state.error == null) item { OutlinedButton(onClick = { model.load(append = true) }, modifier = Modifier.fillMaxWidth()) { Text("Cargar más campañas") } }
    }
}

@Composable
fun NativeCampaignDetail(state: CampaignState, padding: PaddingValues, campaigns: CampaignViewModel,
    community: CommunityViewModel, onDonate: () -> Unit) {
    val context = LocalContext.current
    var tab by rememberSaveable(state.selectedId) { mutableStateOf("summary") }
    val feeds by community.feeds.collectAsStateWithLifecycle()
    val id = state.selectedId ?: return
    fun loadTab(append: Boolean = false) {
        val key = "campaign-$id-$tab"
        val offset = if (append) feeds[key]?.rows?.size ?: 0 else 0
        val query = if (tab == "donors") "?limit=20&offset=$offset" else ""
        community.load(key, "campaigns/$id/$tab$query", append)
    }
    LaunchedEffect(id, tab) { if (tab != "summary") loadTab() }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        if (state.detailLoading) item { LoadingBlock("Abriendo la campaña…") }
        state.detailError?.let { error -> item { ErrorBlock(error) { campaigns.open(id) } } }
        state.detail?.let { campaign ->
            item { BrandPhoto(campaign.imageUrl, campaign.title, Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(24.dp))) }
            item { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Eyebrow(if (campaign.status == "active") "Campaña en curso" else "Resultados de campaña")
                Text(campaign.title, style = MaterialTheme.typography.headlineLarge)
                CampaignFunding(campaign)
                BrandAction("Quiero colaborar", Icons.Outlined.FavoriteBorder, Modifier.fillMaxWidth(), onClick = onDonate)
                OutlinedButton(onClick = {
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain";
                        putExtra(Intent.EXTRA_TEXT, "${campaign.title}\n${BuildConfig.API_BASE_URL}campanas/${campaign.id}") }, "Compartir campaña"))
                }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Share, null); Spacer(Modifier.width(8.dp)); Text("Compartir campaña") }
            } }
            item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("summary" to "Historia", "donors" to "Aportes", "expenses" to "Gastos", "evidence" to "Evidencias", "updates" to "Novedades").forEach { (key, label) ->
                    FilterChip(selected = tab == key, onClick = { tab = key }, label = { Text(label) })
                }
            } }
            if (tab == "summary") {
                item { Text(plainText(campaign.description), style = MaterialTheme.typography.bodyLarge) }
                item { OutlinedCard { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.VerifiedUser, null, tint = MaterialTheme.colorScheme.primary)
                    Text("Transparencia de esta campaña", style = MaterialTheme.typography.titleLarge)
                    Text("Aportes verificados: ${money(campaign.verifiedRaised)}")
                    Text("Recaudación histórica: ${money(campaign.historicalRaised)}")
                    Text("${campaign.donorCount} aportes de dinero confirmados")
                    Text("Los pendientes no se suman a la recaudación pública.", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { tab = "expenses" }) { Text("Consultar gastos y evidencias") }
                } } }
            } else {
                val feed = feeds["campaign-$id-$tab"] ?: CommunityFeed(loading = true)
                if (feed.loading) item { LoadingBlock() }
                feed.error?.let { error -> item { ErrorBlock(error) { loadTab(append = feed.rows.isNotEmpty()) } } }
                items(feed.rows) { row -> OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        val image = publicImage(row)
                        if (image.isNotBlank()) BrandPhoto(image, "Evidencia pública", Modifier.fillMaxWidth().height(190.dp).clip(RoundedCornerShape(14.dp)))
                        Text(row.text("title").ifBlank { row.text("name").ifBlank { row.text("donorName").ifBlank { if (tab == "donors") "Aporte confirmado" else "Registro público" } } }, fontWeight = FontWeight.Bold)
                        val description = row.text("description").ifBlank { row.text("content") }
                        if (description.isNotBlank()) Text(plainText(description))
                        if (row.has("amount")) Text(money(row.optDouble("amount", 0.0)), fontFamily = Outfit, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        val attachment = publicAttachment(row)
                        if (attachment.startsWith("https://")) TextButton(onClick = { openWeb(context, attachment) }) { Text("Abrir comprobante público") }
                    }
                } }
                if (!feed.loading && feed.error == null && feed.rows.isEmpty()) item { EmptyBlock("Sin registros publicados", "El equipo publicará aquí la información disponible.") }
                if (tab == "donors" && feed.hasMore && !feed.loading && feed.error == null) item {
                    OutlinedButton(onClick = { loadTab(true) }, modifier = Modifier.fillMaxWidth()) { Text("Cargar más aportes") }
                }
            }
        }
    }
}

@Composable
fun NewsScreen(padding: PaddingValues, community: CommunityViewModel, navigate: (String) -> Unit) {
    val feeds by community.feeds.collectAsStateWithLifecycle()
    val feed = feeds["news"] ?: CommunityFeed(loading = true)
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { SectionTitle("Noticias de la red", "Historias, actividades y novedades de nuestra comunidad.") }
        item { TextButton(onClick = { community.load("news", "news?limit=20&offset=0") }) { Icon(Icons.Outlined.Refresh, null); Text("Actualizar noticias") } }
        items(feed.rows, key = { it.optInt("id") }) { post -> Card(onClick = { navigate("article/${post.optInt("id")}") },
            shape = RoundedCornerShape(24.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            BrandPhoto(post.text("imageUrl").ifBlank { null }, post.text("title"), Modifier.fillMaxWidth().height(190.dp))
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Eyebrow("Noticias y comunidad")
                Text(post.text("title"), style = MaterialTheme.typography.titleLarge)
                Text(plainText(post.text("summary")), maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text("Leer más →", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            }
        } }
        if (feed.loading) item { LoadingBlock() }
        feed.error?.let { error -> item { ErrorBlock(error) { community.load("news", "news?limit=20&offset=0") } } }
        if (!feed.loading && feed.error == null && feed.rows.isEmpty()) item { EmptyBlock("Todavía no hay noticias", "Las próximas publicaciones aparecerán aquí.") }
        if (feed.hasMore && !feed.loading) item { OutlinedButton(onClick = { community.load("news", "news?limit=20&offset=${feed.rows.size}", true) }) { Text("Cargar más noticias") } }
    }
}

@Composable
fun ArticleScreen(padding: PaddingValues, id: Int, community: CommunityViewModel) {
    DetailLoader("news/$id", community) { article, error, retry ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            if (article == null && error == null) item { LoadingBlock() }
            error?.let { item { ErrorBlock(it, retry) } }
            article?.let { post ->
                item { BrandPhoto(post.text("imageUrl").ifBlank { null }, post.text("title"), Modifier.fillMaxWidth().height(230.dp).clip(RoundedCornerShape(22.dp))) }
                item { Eyebrow("Noticias de la red") }
                item { Text(post.text("title"), style = MaterialTheme.typography.headlineLarge) }
                item { Text(plainText(post.text("summary")), fontWeight = FontWeight.SemiBold, fontSize = 18.sp) }
                item { Text(plainText(post.text("content")), style = MaterialTheme.typography.bodyLarge) }
            }
        }
    }
}

@Composable
fun PetsScreen(padding: PaddingValues, community: CommunityViewModel, navigate: (String) -> Unit) {
    RefreshWhileVisible("pets") { community.load("pets", "pets") }
    val feeds by community.feeds.collectAsStateWithLifecycle()
    val feed = feeds["pets"] ?: CommunityFeed(loading = true)
    var species by rememberSaveable { mutableStateOf("all") }
    var search by rememberSaveable { mutableStateOf("") }
    val rows = feed.rows.filter { (species == "all" || it.text("species") == species) &&
        (search.isBlank() || (it.text("name") + it.text("description") + it.text("location")).contains(search, true)) }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { SectionTitle("Ellos esperan una familia", "Adopta con responsabilidad. Conoce a los animales que buscan un hogar.") }
        item { TextButton(onClick = { community.load("pets", "pets") }, enabled = !feed.loading) { Text("Actualizar adopciones") } }
        item { OutlinedTextField(value = search, onValueChange = { search = it }, label = { Text("Buscar por nombre o ubicación") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, modifier = Modifier.fillMaxWidth(), singleLine = true) }
        item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("all" to "Todos", "perro" to "Perros", "gato" to "Gatos").forEach { (key, label) ->
            FilterChip(selected = species == key, onClick = { species = key }, label = { Text(label) })
        } } }
        items(rows, key = { it.optInt("id") }) { pet -> PetTile(pet) { navigate("pet/${pet.optInt("id")}") } }
        if (feed.loading) item { LoadingBlock() }
        feed.error?.let { error -> item { ErrorBlock(error) { community.load("pets", "pets") } } }
        if (!feed.loading && feed.error == null && rows.isEmpty()) item { EmptyBlock("No hay fichas en este filtro", "Prueba otra búsqueda o vuelve más tarde.") }
    }
}

@Composable
fun PetTile(pet: JSONObject, modifier: Modifier = Modifier, compact: Boolean = false, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        val photo = pet.strings("photos").firstOrNull()
        Box {
            if (photo != null) BrandPhoto(photo, pet.text("name"), Modifier.fillMaxWidth().height(if (compact) 135.dp else 230.dp))
            else Box(Modifier.fillMaxWidth().height(if (compact) 135.dp else 200.dp).background(Color(0xFFFCF0DC)), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.Pets, null, tint = Color(0xFFD19B48), modifier = Modifier.size(62.dp))
            }
            if (pet.optBoolean("urgent")) Surface(Modifier.padding(10.dp), color = Color(0xFFC84F35), shape = CircleShape) {
                Text("URGENTE", Modifier.padding(8.dp), color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
        }
        Column(Modifier.padding(if (compact) 14.dp else 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(pet.text("name"), style = MaterialTheme.typography.titleLarge)
            Text(if (pet.text("species") == "gato") "Gato" else "Perro", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            if (!compact) Text(pet.text("description"), maxLines = 3, overflow = TextOverflow.Ellipsis)
            Text(pet.text("location"), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text("Conocer →", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun PetDetailScreen(padding: PaddingValues, id: Int, community: CommunityViewModel, navigate: (String) -> Unit) {
    var adoption by rememberSaveable(id) { mutableStateOf(false) }
    DetailLoader("pets/$id", community, refreshEnabled = !adoption) { pet, error, retry ->
        if (adoption && pet != null) AdoptionForm(padding, pet, community) { adoption = false }
        else LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            if (pet == null && error == null) item { LoadingBlock() }
            error?.let { item { ErrorBlock(it, retry) } }
            pet?.let { row ->
                item { val photo = row.strings("photos").firstOrNull(); if (photo != null) BrandPhoto(photo, row.text("name"), Modifier.fillMaxWidth().height(280.dp).clip(RoundedCornerShape(24.dp))) }
                item { Eyebrow("Adopción responsable"); Text(row.text("name"), style = MaterialTheme.typography.headlineLarge) }
                item { Text(row.text("location")); Text(row.text("description"), style = MaterialTheme.typography.bodyLarge) }
                item { Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("vaccinated" to "Vacunado", "sterilized" to "Esterilizado", "dewormed" to "Desparasitado").filter { row.optBoolean(it.first) }.forEach { (_, label) ->
                        SuggestionChip(onClick = {}, label = { Text(label) }, icon = { Icon(Icons.Outlined.CheckCircleOutline, null, Modifier.size(16.dp)) })
                    }
                } }
                row.text("adoptionRequirements").takeIf { it.isNotBlank() }?.let { item { SectionTitle("Requisitos de adopción"); Text(it) } }
                item { BrandAction("Quiero adoptar", Icons.Outlined.Pets, Modifier.fillMaxWidth()) { adoption = true } }
            }
        }
    }
}

@Composable
fun UrgentCard(report: JSONObject, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, Color(0xFFE5C9B7))) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Eyebrow(if (report.text("urgency") == "critical") "Emergencia" else "Necesita apoyo", Color(0xFFB55328))
            Text(report.text("title"), style = MaterialTheme.typography.titleLarge)
            Text(report.text("location"), style = MaterialTheme.typography.bodySmall)
            Text(report.text("description"), maxLines = 4, overflow = TextOverflow.Ellipsis)
            Text("Conocer cómo ayudar →", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun UrgentScreen(padding: PaddingValues, community: CommunityViewModel, navigate: (String) -> Unit, openCampaign: (Int) -> Unit) {
    val feeds by community.feeds.collectAsStateWithLifecycle()
    val feed = feeds["urgent"] ?: CommunityFeed(loading = true)
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { SectionTitle("Casos urgentes", "Historias aprobadas por el equipo que necesitan apoyo de la comunidad.") }
        item { BrandAction("Reportar un caso", Icons.Outlined.Support, Modifier.fillMaxWidth(), outlined = true) { navigate("report") } }
        items(feed.rows, key = { it.optInt("id") }) { report -> UrgentCard(report) {
            if (report.optInt("campaignId") > 0) openCampaign(report.optInt("campaignId")) else navigate("contact")
        } }
        if (feed.loading) item { LoadingBlock() }
        feed.error?.let { item { ErrorBlock(it) { community.load("urgent", "reports/urgent") } } }
        if (!feed.loading && feed.error == null && feed.rows.isEmpty()) item { EmptyBlock("No hay casos urgentes publicados", "Puedes reportar una situación para que el equipo la revise.") }
    }
}

@Composable
fun TransparencyScreen(padding: PaddingValues, community: CommunityViewModel, openCampaign: (Int) -> Unit) {
    val model: CampaignViewModel = viewModel(key = "transparency-campaigns")
    val state by model.state.collectAsStateWithLifecycle()
    val stats by community.stats.collectAsStateWithLifecycle()
    val metadataErrors by community.metadataErrors.collectAsStateWithLifecycle()
    val feeds by community.feeds.collectAsStateWithLifecycle()
    val feed = feeds["ledger"] ?: CommunityFeed(loading = true)
    LaunchedEffect(Unit) { model.load("all"); community.loadLedger(); community.loadMetadata() }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        item { Icon(Icons.Outlined.VerifiedUser, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(44.dp)); SectionTitle("Transparencia", "Cada aporte tiene un destino. Consulta los ingresos confirmados y los gastos publicados.") }
        item { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            listOf("Recaudación confirmada" to (stats?.let { money(it.optDouble("totalAmount", 0.0)) } ?: "—"),
                "Aportes registrados" to (stats?.optInt("totalDonations")?.toString() ?: "—"),
                "Donantes" to (stats?.optInt("totalDonors")?.toString() ?: "—")).forEach { (label, value) ->
                OutlinedCard(Modifier.fillMaxWidth()) { Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) { Text(label, style = MaterialTheme.typography.bodySmall); Text(value, fontFamily = Outfit, fontSize = 28.sp, fontWeight = FontWeight.Bold) }
                    Icon(Icons.Outlined.TrendingUp, null, tint = MaterialTheme.colorScheme.primary)
                } }
            }
        } }
        item { SectionTitle("Por campaña") }
        metadataErrors["donations/stats"]?.let { item { ErrorBlock(it) { community.loadMetadata() } } }
        items(state.campaigns.filter { it.status in setOf("active", "completed") }, key = { "campaign-${it.id}" }) { campaign ->
            OutlinedCard(onClick = { openCampaign(campaign.id) }, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(campaign.title, style = MaterialTheme.typography.titleMedium); CampaignFunding(campaign)
            } }
        }
        if (state.loading) item { LoadingBlock() }
        state.error?.let { item { ErrorBlock(it) { model.load("all", append = state.campaigns.isNotEmpty()) } } }
        if (state.hasMore && !state.loading && state.error == null) item {
            OutlinedButton(onClick = { model.load("all", append = true) }, modifier = Modifier.fillMaxWidth()) { Text("Cargar más campañas") }
        }
        item { SectionTitle("Movimientos públicos") }
        items(feed.rows) { row -> OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Eyebrow(if (row.text("type") == "expense") "Gasto publicado" else "Aporte confirmado")
            Text(row.text("campaignTitle"), fontWeight = FontWeight.Bold)
            Text(row.text("description")); Text(money(row.optDouble("amount", 0.0)), style = MaterialTheme.typography.titleLarge)
        } } }
        if (feed.loading) item { LoadingBlock() }
        feed.error?.let { item { ErrorBlock(it) { community.loadLedger() } } }
        if (!feed.loading && feed.error == null && feed.rows.isEmpty()) item { EmptyBlock("Sin movimientos publicados", "Los registros públicos aparecerán aquí.") }
        if (feed.hasMore && !feed.loading) item { OutlinedButton(onClick = { community.loadLedger(true) }, modifier = Modifier.fillMaxWidth()) { Text("Cargar más movimientos") } }
    }
}

@Composable
fun DetailLoader(path: String, community: CommunityViewModel, refreshEnabled: Boolean = true, content: @Composable (JSONObject?, String?, () -> Unit) -> Unit) {
    var revision by remember(path) { mutableIntStateOf(0) }
    var data by remember(path) { mutableStateOf<JSONObject?>(null) }
    var error by remember(path) { mutableStateOf<String?>(null) }
    LaunchedEffect(path, revision, refreshEnabled) {
        if (!refreshEnabled) return@LaunchedEffect
        error = null
        try { data = community.api.obj(path) }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { data = null; error = failure.message ?: "No se pudo consultar la información." }
    }
    if (refreshEnabled) RefreshWhileVisible(path) { revision++ }
    content(data, error) { revision++ }
}

@Composable
fun RefreshWhileVisible(key: String, refresh: () -> Unit) {
    val owner = LocalLifecycleOwner.current
    val currentRefresh by rememberUpdatedState(refresh)
    LaunchedEffect(owner, key) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            currentRefresh()
            while (true) { delay(30_000); currentRefresh() }
        }
    }
}
