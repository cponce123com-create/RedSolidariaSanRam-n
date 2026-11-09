package pe.redsolidaria.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

@Composable
fun NoticePanel(padding: PaddingValues, onCampaign: (Int) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val notices by NoticeStore.items.collectAsStateWithLifecycle()
    var categories by remember { mutableStateOf(NOTICE_CATEGORIES.keys.associateWith { NoticeStore.enabled(context, it) }) }
    var alerts by remember { mutableStateOf(NoticeStore.alertsEnabled(context)) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        alerts = granted
        NoticeStore.setAlerts(context, granted)
        if (!granted) error = "No se autorizó mostrar avisos en el teléfono. Puedes seguir consultando el historial aquí."
    }
    fun refresh() {
        if (loading) return
        scope.launch {
            loading = true; error = null
            try { NoticeStore.sync(context, false) }
            catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (failure: Exception) { error = failure.message ?: "No hay conexión. Reintenta más tarde." }
            finally { loading = false }
        }
    }
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) refresh() }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(Unit) { refresh() }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Avisos importantes", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Versión ${BuildConfig.VERSION_NAME} · Historial de novedades de la red")
                Text("Las consultas en segundo plano se programan cada 15 minutos. Android puede retrasarlas por batería o conexión; no son avisos push inmediatos.", style = MaterialTheme.typography.bodySmall)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Avisos en el teléfono", modifier = Modifier.weight(1f))
                    Switch(checked = alerts, onCheckedChange = { enabled ->
                        if (enabled && Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
                                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else { alerts = enabled; NoticeStore.setAlerts(context, enabled) }
                    })
                }
                NOTICE_CATEGORIES.forEach { (key, label) ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(label, modifier = Modifier.weight(1f))
                        Switch(checked = categories[key] == true, onCheckedChange = { enabled ->
                            categories = categories + (key to enabled); NoticeStore.setCategory(context, key, enabled)
                        })
                    }
                }
                Text("Las categorías desactivadas se ocultan del historial y no generan avisos. Los aportes se agrupan por campaña y hora.", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { refresh() }, enabled = !loading) { Text("Actualizar") }
                    TextButton(onClick = { scope.launch { NoticeStore.markRead(context) } }) { Text("Marcar como leídos") }
                }
                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
        val visible = notices.filter { categories[it.category] == true }
        if (!loading && error == null && visible.isEmpty()) item { Text("Todavía no hay novedades en estas categorías.") }
        items(visible, key = { it.key }) { notice ->
            Card(onClick = {
                scope.launch { NoticeStore.markRead(context, notice.key) }
                notice.campaignId?.let(onCampaign) ?: context.startActivity(Intent(Intent.ACTION_VIEW,
                    Uri.parse(BuildConfig.API_BASE_URL.trimEnd('/') + notice.path)))
            }) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (notice.read) "Leído" else "Nuevo", color = MaterialTheme.colorScheme.primary)
                    Text(notice.title, fontWeight = FontWeight.Bold)
                    Text(notice.body)
                    Text(if (notice.campaignId == null) "Ver caso en la web" else "Abrir campaña", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}
