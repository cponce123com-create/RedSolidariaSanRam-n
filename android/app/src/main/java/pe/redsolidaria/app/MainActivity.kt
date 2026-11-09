package pe.redsolidaria.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.SubcomposeAsyncImage
import java.text.NumberFormat
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NoticeStore.initialize(applicationContext)
        enableEdgeToEdge()
        setContent {
            val colors = if (isSystemInDarkTheme()) darkColorScheme(primary = Color(0xFF81D98D))
                else lightColorScheme(primary = Color(0xFF238B34), secondaryContainer = Color(0xFFE8F4E9))
            MaterialTheme(colorScheme = colors) { CampaignApp(initialCampaign = intent.getIntExtra("notice_campaign", 0), initialNotice = intent.getStringExtra("notice_key")) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CampaignApp(model: CampaignViewModel = viewModel(), initialCampaign: Int = 0, initialNotice: String? = null) {
    val context = LocalContext.current
    var inbox by remember { mutableStateOf(initialNotice != null && initialCampaign == 0) }
    val notices by NoticeStore.items.collectAsStateWithLifecycle()
    val categories by NoticeStore.categories.collectAsStateWithLifecycle()
    val unread = notices.count { !it.read && it.category in categories }
    LaunchedEffect(Unit) {
        initialNotice?.let { NoticeStore.markRead(context, it) }
        if (initialCampaign > 0) model.open(initialCampaign)
        try { NoticeStore.sync(context, false) } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { /* Inbox exposes retry and error. */ }
    }
    val state by model.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    BackHandler(enabled = state.selectedId != null || inbox) {
        if (state.selectedId != null) model.closeDetail() else inbox = false
    }
    Scaffold(topBar = {
        TopAppBar(
            title = { Column {
                Text("Red Solidaria", fontWeight = FontWeight.Bold)
                Text("San Ramón · Chanchamayo", style = MaterialTheme.typography.labelMedium)
            } },
            navigationIcon = {
                if (state.selectedId != null || inbox) TextButton(onClick = {
                    if (state.selectedId != null) model.closeDetail() else inbox = false
                }) { Text("Volver") }
            },
            actions = {
                IconButton(onClick = { inbox = true; model.closeDetail() }, modifier = Modifier.semantics { contentDescription = "Avisos importantes: $unread sin leer" }) {
                    BadgedBox(badge = { if (unread > 0) Badge { Text(unread.toString()) } }) { Text("🔔") }
                }
                IconButton(enabled = !state.loading && !state.detailLoading && !inbox, modifier = Modifier.semantics { contentDescription = "Actualizar campañas" }, onClick = {
                    state.selectedId?.let(model::open) ?: model.load()
                }) { Text("↻") }
            },
        )
    }) { padding ->
        if (state.selectedId != null) {
            LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp)) {
                if (state.detailLoading) item { Loading() }
                state.detailError?.let { error -> item { ErrorMessage(error) { model.open(requireNotNull(state.selectedId)) } } }
                state.detail?.let { campaign -> item { CampaignDetail(campaign) } }
            }
        } else if (inbox) {
            NoticePanel(padding = padding, onCampaign = { id -> model.open(id) })
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding), state = listState,
                contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Juntos hacemos más", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text("Conoce las campañas y el apoyo que recibe nuestra comunidad.")
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("all" to "Todas", "active" to "Activas", "completed" to "Completadas").forEach { (value, label) ->
                                FilterChip(selected = state.filter == value, onClick = { model.load(value) }, label = { Text(label) })
                            }
                        }
                    }
                }
                items(state.campaigns, key = { it.id }) { campaign ->
                    Card(onClick = { model.open(campaign.id) }, modifier = Modifier.fillMaxWidth()) {
                        CampaignImage(campaign)
                        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(statusLabel(campaign.status), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
                            Text(campaign.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                            Text(campaign.description, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            Funding(campaign)
                            Text("Ver campaña", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (state.loading) item { Loading() }
                state.error?.let { error -> item { ErrorMessage(error) { model.load(append = state.campaigns.isNotEmpty()) } } }
                if (!state.loading && state.error == null && state.campaigns.isEmpty()) item {
                    Text("No hay campañas en este filtro. Puedes elegir otro o actualizar.")
                }
                if (state.hasMore && !state.loading && state.error == null) item {
                    OutlinedButton(onClick = { model.load(append = true) }, modifier = Modifier.fillMaxWidth()) { Text("Cargar más campañas") }
                }
            }
        }
    }
}

@Composable
private fun CampaignImage(campaign: Campaign) {
    SubcomposeAsyncImage(
        model = campaign.imageUrl, contentDescription = "Imagen de ${campaign.title}",
        modifier = Modifier.fillMaxWidth().height(210.dp).background(MaterialTheme.colorScheme.secondaryContainer),
        contentScale = ContentScale.Crop,
        loading = { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() } },
        error = { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Red Solidaria · San Ramón") } },
    )
}

@Composable
private fun Funding(campaign: Campaign) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LinearProgressIndicator(progress = { campaign.progress }, modifier = Modifier.fillMaxWidth())
        Text("${money(campaign.raised)} recaudados", fontWeight = FontWeight.Bold)
        Text("Meta: ${money(campaign.goal)} · ${campaign.donorCount} aportes de dinero", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun CampaignDetail(campaign: Campaign) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        CampaignImage(campaign)
        Text(statusLabel(campaign.status), color = MaterialTheme.colorScheme.primary)
        Text(campaign.title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(campaign.category, style = MaterialTheme.typography.labelLarge)
        Funding(campaign)
        Text(campaign.description, style = MaterialTheme.typography.bodyLarge)
        HorizontalDivider()
        Text("Origen de la recaudación", style = MaterialTheme.typography.titleMedium)
        Text("Aportes verificados: ${money(campaign.verifiedRaised)}")
        Text("Recaudación histórica: ${money(campaign.historicalRaised)}")
        Text("Los importes se consultan en el mismo servidor que utiliza la web.", style = MaterialTheme.typography.bodySmall)
        Button(onClick = {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, "${campaign.title}\n${BuildConfig.API_BASE_URL}campanas/${campaign.id}")
            }
            context.startActivity(Intent.createChooser(share, "Compartir campaña"))
        }, modifier = Modifier.fillMaxWidth()) { Text("Compartir campaña") }
    }
}

@Composable
private fun Loading() {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator()
        Text("Consultando campañas… El servidor puede tardar al iniciar.")
    }
}

@Composable
private fun ErrorMessage(message: String, retry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(message, color = MaterialTheme.colorScheme.error)
        OutlinedButton(onClick = retry) { Text("Reintentar") }
    }
}

private fun money(amount: Double): String = NumberFormat.getCurrencyInstance(Locale("es", "PE")).format(amount)
private fun statusLabel(status: String): String = when (status) {
    "active" -> "En curso"
    "completed" -> "Completada"
    "paused" -> "En pausa"
    "cancelled" -> "Cancelada"
    "closed" -> "Cerrada"
    else -> status
}
