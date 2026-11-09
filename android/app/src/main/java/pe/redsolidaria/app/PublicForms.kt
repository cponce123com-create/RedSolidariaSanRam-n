package pe.redsolidaria.app

import android.util.Patterns
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

@Composable
fun PublicFormScreen(route: String, padding: PaddingValues, community: CommunityViewModel,
    navigate: (String) -> Unit, whatsapp: () -> Unit) {
    var name by rememberSaveable(route) { mutableStateOf("") }
    var email by rememberSaveable(route) { mutableStateOf("") }
    var phone by rememberSaveable(route) { mutableStateOf("") }
    var title by rememberSaveable(route) { mutableStateOf("") }
    var description by rememberSaveable(route) { mutableStateOf("") }
    var location by rememberSaveable(route) { mutableStateOf("") }
    var availability by rememberSaveable(route) { mutableStateOf("") }
    var type by rememberSaveable(route) { mutableStateOf("familia-vulnerable") }
    var urgency by rememberSaveable(route) { mutableStateOf("medium") }
    var anonymous by rememberSaveable(route) { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    var submitted by rememberSaveable(route) { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val heading = when (route) { "volunteer" -> "La solidaridad necesita personas"; "report" -> "Necesito ayuda"; else -> "Conversemos" }
    val subtitle = when (route) { "volunteer" -> "Tu tiempo, tus manos y tu compañía pueden cambiar una historia. Inscríbete en la red."
        "report" -> "Cuéntanos el caso. El equipo lo revisará antes de publicarlo. Este formulario no sustituye la atención de una emergencia."
        else -> "Escríbenos para coordinar tu aporte, resolver una duda o conocer más sobre la red." }
    fun submit() {
        if (submitting) return
        error = when {
            name.trim().length < 2 -> "Escribe tu nombre completo."
            route != "report" && !Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() -> "Escribe un correo válido."
            email.isNotBlank() && !Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() -> "Revisa el correo electrónico."
            route == "report" && title.trim().length < 5 -> "El título debe tener al menos 5 caracteres."
            route == "report" && location.trim().length < 3 -> "Indica la ubicación del caso."
            route == "report" && description.trim().length < 30 -> "Describe el caso con al menos 30 caracteres."
            route == "volunteer" && availability.trim().length < 3 -> "Indica cuándo puedes colaborar."
            route == "contact" && (title.isBlank() || description.trim().length < 10) -> "Completa el asunto y un mensaje de al menos 10 caracteres."
            else -> null
        }
        if (error != null) return
        val body = when (route) {
            "report" -> JSONObject().put("type", type).put("title", title.trim()).put("description", description.trim())
                .put("location", location.trim()).put("urgency", urgency).put("reporterName", name.trim())
                .put("reporterPhone", phone.trim()).put("reporterEmail", email.trim()).put("isAnonymous", anonymous)
            "volunteer" -> JSONObject().put("name", name.trim()).put("email", email.trim()).put("phone", phone.trim())
                .put("district", location.trim()).put("availability", availability.trim()).put("motivation", description.trim())
            else -> JSONObject().put("name", name.trim()).put("email", email.trim()).put("phone", phone.trim())
                .put("subject", title.trim()).put("message", description.trim())
        }
        val path = when (route) { "report" -> "reports"; "volunteer" -> "volunteers"; else -> "contact" }
        scope.launch {
            submitting = true
            try { community.api.request(path, body); submitted = true }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { error = failure.message ?: "No se pudo confirmar el envío. Revisa tu conexión." }
            finally { submitting = false }
        }
    }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { Icon(if (route == "volunteer") Icons.Outlined.Groups else if (route == "report") Icons.Outlined.Support else Icons.Outlined.MailOutline,
            null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp)); Spacer(Modifier.height(14.dp)); SectionTitle(heading, subtitle) }
        if (submitted) {
            item { OutlinedCard { Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Icon(Icons.Outlined.CheckCircle, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(44.dp))
                Text("Recibimos tu ${if (route == "volunteer") "postulación" else if (route == "report") "reporte" else "mensaje"}", style = MaterialTheme.typography.titleLarge)
                Text("El servidor confirmó el registro. El equipo revisará la información y se pondrá en contacto contigo cuando corresponda.")
                Button(onClick = { navigate("home") }) { Text("Volver a Inicio") }
            } } }
        } else {
            if (route == "contact") item { BrandAction("Escribir por WhatsApp", Icons.Outlined.ChatBubbleOutline, Modifier.fillMaxWidth(), onClick = whatsapp) }
            item { OutlinedTextField(name, { name = it }, label = { Text("Nombre completo *") }, modifier = Modifier.fillMaxWidth(), enabled = !submitting, singleLine = true) }
            item { OutlinedTextField(email, { email = it }, label = { Text(if (route == "report") "Correo electrónico (opcional)" else "Correo electrónico *") }, modifier = Modifier.fillMaxWidth(), enabled = !submitting, singleLine = true) }
            item { OutlinedTextField(phone, { phone = it }, label = { Text("Teléfono (opcional)") }, modifier = Modifier.fillMaxWidth(), enabled = !submitting, singleLine = true) }
            if (route == "report") {
                item { ChoiceField("Tipo de caso", type, listOf("familia-vulnerable" to "Familia vulnerable", "nino-necesidad" to "Niñez", "adulto-mayor" to "Adulto mayor", "animal-herido" to "Animal herido", "albergue" to "Albergue", "emergencia-comunitaria" to "Emergencia comunitaria"), enabled = !submitting) { type = it } }
                item { ChoiceField("Urgencia", urgency, listOf("low" to "Baja", "medium" to "Media", "high" to "Alta", "critical" to "Crítica"), enabled = !submitting) { urgency = it } }
            }
            if (route != "volunteer") item { OutlinedTextField(title, { title = it }, label = { Text(if (route == "report") "Título del caso *" else "Asunto *") }, modifier = Modifier.fillMaxWidth(), enabled = !submitting) }
            if (route != "contact") item { OutlinedTextField(location, { location = it }, label = { Text(if (route == "report") "Ubicación del caso *" else "Distrito o localidad") }, modifier = Modifier.fillMaxWidth(), enabled = !submitting) }
            if (route == "volunteer") item { OutlinedTextField(availability, { availability = it }, label = { Text("¿Cuándo puedes colaborar? *") }, modifier = Modifier.fillMaxWidth(), minLines = 2, enabled = !submitting) }
            item { OutlinedTextField(description, { description = it }, label = { Text(when (route) { "report" -> "Describe lo que sucede *"; "volunteer" -> "¿Cómo te gustaría ayudar?"; else -> "Mensaje *" }) }, modifier = Modifier.fillMaxWidth(), minLines = 5, enabled = !submitting) }
            if (route == "report") item { Row { Checkbox(anonymous, { anonymous = it }, enabled = !submitting); Text("Quiero mantener mi identidad fuera de la publicación pública.", modifier = Modifier.padding(top = 10.dp)) } }
            error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
            item { Text("Los campos con * son obligatorios. La información se envía al mismo equipo que administra la web.", style = MaterialTheme.typography.bodySmall) }
            item { Button(onClick = { submit() }, enabled = !submitting, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp)) {
                if (submitting) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(10.dp)) }
                Text(if (submitting) "Enviando…" else if (route == "volunteer") "Enviar postulación" else if (route == "report") "Enviar caso para revisión" else "Enviar mensaje")
            } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChoiceField(label: String, value: String, choices: List<Pair<String, String>>, enabled: Boolean = true, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded && enabled, onExpandedChange = { if (enabled) expanded = it }) {
        OutlinedTextField(choices.firstOrNull { it.first == value }?.second ?: value, {}, readOnly = true,
            label = { Text(label) }, enabled = enabled, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor().fillMaxWidth())
        ExposedDropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            choices.forEach { (key, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { onSelect(key); expanded = false }) }
        }
    }
}

@Composable
fun AdoptionForm(padding: PaddingValues, pet: JSONObject, community: CommunityViewModel, close: () -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var age by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var address by rememberSaveable { mutableStateOf("") }
    var reason by rememberSaveable { mutableStateOf("") }
    var housing by rememberSaveable { mutableStateOf("casa-propia") }
    var experience by rememberSaveable { mutableStateOf(false) }
    var yard by rememberSaveable { mutableStateOf(false) }
    var followUp by rememberSaveable { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var sent by rememberSaveable { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
        item { SectionTitle("Adoptar a ${pet.text("name")}", "El equipo revisará tu solicitud para encontrar un hogar responsable.") }
        if (sent) item { EmptyBlock("Solicitud recibida", "El servidor confirmó tu solicitud de adopción. El equipo se comunicará contigo."); TextButton(onClick = close) { Text("Volver a la ficha") } }
        else {
            item { OutlinedTextField(name, { name = it }, label = { Text("Nombre completo *") }, modifier = Modifier.fillMaxWidth(), enabled = !sending) }
            item { OutlinedTextField(age, { age = it.filter(Char::isDigit) }, label = { Text("Edad *") }, modifier = Modifier.fillMaxWidth(), enabled = !sending) }
            item { OutlinedTextField(phone, { phone = it }, label = { Text("Teléfono *") }, modifier = Modifier.fillMaxWidth(), enabled = !sending) }
            item { OutlinedTextField(address, { address = it }, label = { Text("Dirección *") }, modifier = Modifier.fillMaxWidth(), enabled = !sending) }
            item { ChoiceField("Vivienda", housing, listOf("casa-propia" to "Casa propia", "casa-alquilada" to "Casa alquilada", "departamento" to "Departamento", "cuarto" to "Cuarto"), !sending) { housing = it } }
            item { OutlinedTextField(reason, { reason = it }, label = { Text("¿Por qué deseas adoptar? *") }, modifier = Modifier.fillMaxWidth(), minLines = 4, enabled = !sending) }
            item { Row { Checkbox(experience, { experience = it }, enabled = !sending); Text("Tengo experiencia cuidando mascotas", Modifier.padding(top = 12.dp)) } }
            item { Row { Checkbox(yard, { yard = it }, enabled = !sending); Text("Tengo patio o espacio exterior", Modifier.padding(top = 12.dp)) } }
            item { Row { Checkbox(followUp, { followUp = it }, enabled = !sending); Text("Acepto que el equipo realice seguimiento de la adopción", Modifier.padding(top = 12.dp)) } }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
            item { Button(onClick = {
                error = when { name.trim().length < 2 -> "Escribe tu nombre."; age.toIntOrNull() == null || (age.toIntOrNull() ?: 0) < 18 -> "La solicitud debe realizarla una persona mayor de edad."
                    phone.filter(Char::isDigit).length < 7 -> "Escribe un teléfono de contacto."; address.trim().length < 5 -> "Completa tu dirección."; reason.trim().length < 20 -> "Explica tu motivación con al menos 20 caracteres."; !followUp -> "Se necesita aceptar el seguimiento de la adopción."; else -> null }
                if (error == null && !sending) scope.launch {
                    sending = true
                    try { community.api.request("pets/${pet.optInt("id")}/adopt", JSONObject().put("requesterName", name.trim()).put("requesterAge", age)
                        .put("requesterPhone", phone.trim()).put("requesterAddress", address.trim()).put("housingType", housing)
                        .put("adoptionReason", reason.trim()).put("hasPetExperience", experience).put("hasYard", yard).put("acceptsFollowUp", followUp)); sent = true }
                    catch (cancelled: CancellationException) { throw cancelled }
                    catch (failure: Exception) { error = failure.message ?: "No se pudo confirmar la solicitud." }
                    finally { sending = false }
                }
            }, enabled = !sending, modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp)) { Text(if (sending) "Enviando…" else "Enviar solicitud de adopción") } }
            item { TextButton(onClick = close, enabled = !sending) { Text("Volver a la ficha") } }
        }
    }
}
