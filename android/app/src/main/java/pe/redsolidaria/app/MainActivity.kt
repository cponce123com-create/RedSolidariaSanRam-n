package pe.redsolidaria.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NoticeStore.initialize(applicationContext)
        enableEdgeToEdge()
        setContent {
            val systemDark = isSystemInDarkTheme()
            var dark by rememberSaveable { mutableStateOf(systemDark) }
            BrandTheme(dark) {
                RedSolidariaApp(initialCampaign = intent.getIntExtra("notice_campaign", 0),
                    initialNotice = intent.getStringExtra("notice_key"), onTheme = { dark = !dark })
            }
        }
    }
}

private data class NavTab(val key: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val tabs = listOf(NavTab("home", "Inicio", Icons.Outlined.Home), NavTab("campaigns", "Campañas", Icons.Outlined.FavoriteBorder),
    NavTab("news", "Noticias", Icons.Outlined.Article), NavTab("pets", "Adopciones", Icons.Outlined.Pets), NavTab("contact", "Contacto", Icons.Outlined.MailOutline))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RedSolidariaApp(campaigns: CampaignViewModel = viewModel(), community: CommunityViewModel = viewModel(),
    initialCampaign: Int = 0, initialNotice: String? = null, onTheme: () -> Unit) {
    val context = LocalContext.current
    var route by rememberSaveable { mutableStateOf(if (initialNotice != null && initialCampaign == 0) "notices" else "home") }
    var more by remember { mutableStateOf(false) }
    var donation by remember { mutableStateOf(false) }
    var contactError by remember { mutableStateOf<String?>(null) }
    val campaignState by campaigns.state.collectAsStateWithLifecycle()
    val identity by community.identity.collectAsStateWithLifecycle()
    val settings by community.settings.collectAsStateWithLifecycle()
    val notices by NoticeStore.items.collectAsStateWithLifecycle()
    val categories by NoticeStore.categories.collectAsStateWithLifecycle()
    val unread = notices.count { !it.read && it.category in categories }
    fun navigate(next: String) { campaigns.closeDetail(); route = next; more = false }
    fun whatsapp(title: String? = null) {
        val number = settings.text("org_whatsapp").filter(Char::isDigit)
        if (number.length < 8) {
            donation = false
            community.loadMetadata()
            contactError = "No se pudo obtener el número de WhatsApp. Puedes reintentar o enviar un mensaje desde Contacto."
            return
        }
        val text = if (title != null) "Hola, quiero apoyar la campaña “$title”. ¿Me indican cómo coordinar mi aporte?"
            else settings.text("whatsapp_message_general").ifBlank { "Hola, quisiera más información sobre cómo ayudar a Red Solidaria San Ramón." }
        try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$number?text=${Uri.encode(text)}"))) }
        catch (_: android.content.ActivityNotFoundException) { contactError = "No se encontró una aplicación para abrir WhatsApp. Puedes enviar un mensaje desde Contacto." }
    }
    LaunchedEffect(Unit) {
        initialNotice?.let { NoticeStore.markRead(context, it) }
        if (initialCampaign > 0) campaigns.open(initialCampaign)
        try { NoticeStore.sync(context, false) } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { }
    }
    BackHandler(enabled = route != "home" || campaignState.selectedId != null) {
        if (campaignState.selectedId != null) campaigns.closeDetail()
        else route = if (route.startsWith("pet/")) "pets" else if (route.startsWith("article/")) "news" else "home"
    }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
        TopAppBar(colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface),
            navigationIcon = {
                if (campaignState.selectedId != null || route !in tabs.map { it.key }) IconButton(onClick = {
                    if (campaignState.selectedId != null) campaigns.closeDetail() else navigate(if (route.startsWith("pet/")) "pets" else if (route.startsWith("article/")) "news" else "home")
                }) { Icon(Icons.Outlined.ArrowBack, "Volver") }
            }, title = {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    BrandPhoto(identity?.optJSONObject("logo")?.text("url")?.ifBlank { null } ?: R.drawable.brand_logo,
                        "Logo de Red Solidaria", Modifier.size(35.dp), fallback = R.drawable.brand_logo,
                        scale = androidx.compose.ui.layout.ContentScale.Fit)
                    Column(Modifier.weight(1f)) {
                        Text("RED SOLIDARIA", fontFamily = Outfit, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        Text("SAN RAMÓN", fontFamily = DmSans, fontSize = 9.sp, color = MaterialTheme.colorScheme.primary, letterSpacing = 2.sp, maxLines = 1)
                    }
                }
            }, actions = {
                FilledTonalButton(onClick = { donation = true }, shape = CircleShape,
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)) { Text("Donar", fontSize = 12.sp) }
                IconButton(onClick = { navigate("notices") }) {
                    BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                        Icon(Icons.Outlined.NotificationsNone, "Avisos: $unread sin leer")
                    }
                }
                Box {
                    IconButton(onClick = { more = true }) { Icon(Icons.Outlined.Menu, "Abrir menú de secciones") }
                    DropdownMenu(expanded = more, onDismissRequest = { more = false }) {
                        listOf("transparency" to "Transparencia", "urgent" to "Casos urgentes", "help" to "Cómo ayudar",
                            "volunteer" to "Voluntariado", "report" to "Necesito ayuda", "about" to "Nosotros",
                            "catalog" to "Catálogo solidario", "animal" to "Ayuda animal", "notices" to "Avisos").forEach { (key, label) ->
                            DropdownMenuItem(text = { Text(label) }, onClick = { navigate(key) })
                        }
                        HorizontalDivider()
                        DropdownMenuItem(text = { Text("Cambiar tema claro / oscuro") }, onClick = { onTheme(); more = false })
                        DropdownMenuItem(text = { Text("Administración · abrir panel web") }, onClick = { more = false; openWeb(context, "/admin/login") })
                    }
                }
            })
    }, bottomBar = {
        NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 3.dp) {
            tabs.forEach { tab ->
                NavigationBarItem(selected = route == tab.key || (route.startsWith("pet/") && tab.key == "pets") || (route.startsWith("article/") && tab.key == "news"),
                    onClick = { navigate(tab.key) }, icon = { Icon(tab.icon, tab.label, Modifier.size(22.dp)) },
                    label = { Text(tab.label, fontSize = 10.sp) },
                    colors = NavigationBarItemDefaults.colors(indicatorColor = MaterialTheme.colorScheme.secondaryContainer,
                        selectedIconColor = MaterialTheme.colorScheme.primary, selectedTextColor = MaterialTheme.colorScheme.primary))
            }
        }
    }, floatingActionButton = {
        if (route in setOf("home", "campaigns", "pets", "news", "about", "help")) {
            SmallFloatingActionButton(onClick = { whatsapp() }, containerColor = BrandGreen, contentColor = Color.White, shape = CircleShape) {
                Icon(Icons.Outlined.ChatBubbleOutline, "Coordinar por WhatsApp")
            }
        }
    }) { padding ->
        if (campaignState.selectedId != null) {
            NativeCampaignDetail(campaignState, padding, campaigns, community, onDonate = { donation = true })
        } else when {
            route == "home" -> HomeScreen(padding, campaigns, community, ::navigate, { campaigns.open(it) }, { donation = true })
            route == "campaigns" -> CampaignListScreen(padding, campaignState, campaigns)
            route == "notices" -> NoticePanel(padding, onCampaign = { campaigns.open(it) })
            route == "news" -> NewsScreen(padding, community, ::navigate)
            route == "pets" -> PetsScreen(padding, community, ::navigate)
            route.startsWith("pet/") -> PetDetailScreen(padding, route.substringAfter('/').toInt(), community, ::navigate)
            route.startsWith("article/") -> ArticleScreen(padding, route.substringAfter('/').toInt(), community)
            route == "transparency" -> TransparencyScreen(padding, community, { campaigns.open(it) })
            route == "urgent" -> UrgentScreen(padding, community, ::navigate, { campaigns.open(it) })
            route in setOf("report", "volunteer", "contact") -> PublicFormScreen(route, padding, community, ::navigate, { whatsapp() })
            else -> InformationScreen(route, padding, community, ::navigate, { donation = true })
        }
    }
    contactError?.let { message -> AlertDialog(onDismissRequest = { contactError = null },
        title = { Text("Contacto por WhatsApp") }, text = { Text(message) },
        confirmButton = { TextButton(onClick = { contactError = null; whatsapp() }) { Text("Reintentar") } },
        dismissButton = { TextButton(onClick = { contactError = null; navigate("contact") }) { Text("Abrir Contacto") } }) }
    if (donation) AlertDialog(onDismissRequest = { donation = false }, icon = { Icon(Icons.Outlined.Handshake, null) },
        title = { Text("Coordina tu aporte por WhatsApp") },
        text = { Text("Escríbenos y te ayudaremos a colaborar. El equipo registra el aporte como pendiente; solo después de confirmarlo se suma a la recaudación pública.") },
        confirmButton = { Button(onClick = { donation = false; whatsapp(campaignState.detail?.title) }) { Text("Coordinar aporte") } },
        dismissButton = { TextButton(onClick = { donation = false }) { Text("Cerrar") } })
}
