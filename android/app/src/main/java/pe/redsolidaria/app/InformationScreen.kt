package pe.redsolidaria.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun InformationScreen(route: String, padding: PaddingValues, community: CommunityViewModel,
    navigate: (String) -> Unit, donate: () -> Unit) {
    val identity by community.identity.collectAsStateWithLifecycle()
    val cms by community.cms.collectAsStateWithLifecycle()
    val slug = when (route) { "about" -> "nosotros"; "help" -> "como-ayudar"; "catalog" -> "catalogo"; else -> "ayuda-animal" }
    LaunchedEffect(slug) { community.loadCms(slug) }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(22.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
        if (route == "about") {
            item { Eyebrow("Nuestra historia · San Ramón, Chanchamayo"); Spacer(Modifier.height(12.dp));
                SectionTitle(identity?.optJSONObject("story")?.text("title")?.ifBlank { null } ?: "Somos una red, no solo una página.") }
            item { BrandPhoto(identity?.optJSONObject("story")?.strings("photos")?.firstOrNull() ?: R.drawable.historia_red,
                "Voluntarios de Red Solidaria San Ramón", Modifier.fillMaxWidth().height(250.dp).clip(RoundedCornerShape(24.dp)), fallback = R.drawable.historia_red) }
            item { Text(plainText(identity?.optJSONObject("story")?.text("html")?.ifBlank { null }
                ?: "Todo comenzó con un grupo de amigos que decidió juntar fondos para llevar juguetes y una chocolatada a los niños de los anexos más alejados de San Ramón en Navidad. Hoy somos una red que asiste en casos sociales, apoyo médico y rescate animal durante todo el año. Detrás de cada campaña hay personas reales, con nombres y rostros."), style = MaterialTheme.typography.bodyLarge) }
            identity?.text("mission")?.takeIf { it.isNotBlank() }?.let { mission -> item { SectionTitle("Nuestra misión"); Text(plainText(mission)) } }
            identity?.text("vision")?.takeIf { it.isNotBlank() }?.let { vision -> item { SectionTitle("Nuestra visión"); Text(plainText(vision)) } }
            identity?.list("values")?.forEach { value -> item { OutlinedCard { Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(value.text("title"), style = MaterialTheme.typography.titleMedium); Text(value.text("description"))
            } } } }
            item { BrandAction("Quiero formar parte", Icons.Outlined.Groups, Modifier.fillMaxWidth()) { navigate("volunteer") } }
        } else if (route == "help") {
            item { Eyebrow("Tu ayuda tiene muchas formas"); Spacer(Modifier.height(12.dp)); SectionTitle("¿Cómo puedes ayudar?", "No necesitas hacer mucho. A veces, compartir o estar presente cambia una historia.") }
            val ways = listOf(Triple("Donar a una campaña", "Coordina tu aporte con el equipo. Solo los aportes confirmados se suman a la recaudación pública.", "donate"),
                Triple("Donar productos", "Puedes colaborar con alimentos, ropa, útiles, juguetes y otros productos que la comunidad necesita.", "contact"),
                Triple("Donar alimento para animales", "Ayuda a sostener la atención y alimentación de animales en situación vulnerable.", "contact"),
                Triple("Ser voluntario", "Aporta tu tiempo en campañas, colectas, actividades y acompañamiento.", "volunteer"),
                Triple("Ser aliado", "Tu empresa, organización o grupo puede colaborar con las actividades de la red.", "contact"),
                Triple("Difundir", "Comparte las campañas y los casos publicados para que lleguen a más personas.", "campaigns"))
            ways.forEach { (title, description, destination) -> item { OutlinedCard(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp)) {
                Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Icon(Icons.Outlined.VolunteerActivism, null, tint = MaterialTheme.colorScheme.primary)
                    Text(title, style = MaterialTheme.typography.titleLarge); Text(description)
                    Button(onClick = { if (destination == "donate") donate() else navigate(destination) }) { Text("Quiero colaborar") }
                }
            } } }
        } else if (route == "catalog") {
            item { Eyebrow("Apoyo para nuestra comunidad"); Spacer(Modifier.height(12.dp)); SectionTitle("Catálogo solidario", "Conoce los tipos de apoyo que coordina la red. La disponibilidad debe confirmarse con el equipo.") }
            listOf("Sillas de ruedas" to "Movilidad", "Andadores" to "Movilidad", "Férulas" to "Ortopedia", "Muletas" to "Movilidad",
                "Ropa" to "Vestimenta", "Camas hospitalarias" to "Equipamiento médico", "Balones de gas" to "Servicios básicos", "Cocinas" to "Equipamiento del hogar").forEach { (title, category) ->
                item { OutlinedCard(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp)) {
                    Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Outlined.Inventory2, null, tint = MaterialTheme.colorScheme.primary)
                        Eyebrow(category); Text(title, style = MaterialTheme.typography.titleLarge)
                        Text("Consulta disponibilidad, requisitos y formas de colaborar con el equipo.")
                        OutlinedButton(onClick = { navigate("contact") }) { Text("Consultar al equipo") }
                    }
                } }
            }
        } else {
            item { Eyebrow("Ellos también son parte de la comunidad"); Spacer(Modifier.height(12.dp)); SectionTitle("Bienestar animal", "Adopción responsable, acompañamiento y ayuda a animales que lo necesitan.") }
            item { BrandAction("Conocer animales en adopción", Icons.Outlined.Pets, Modifier.fillMaxWidth()) { navigate("pets") } }
            item { BrandAction("Reportar un animal que necesita ayuda", Icons.Outlined.Support, Modifier.fillMaxWidth(), outlined = true) { navigate("report") } }
            item { OutlinedCard { Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Ayudar también es cuidar", style = MaterialTheme.typography.titleLarge)
                Text("Puedes colaborar con alimento, atención, difusión y un hogar responsable. Coordina con el equipo antes de realizar una entrega.")
                Button(onClick = { navigate("contact") }) { Text("Quiero ayudar a un animal") }
            } } }
        }
        // Reuse published editorial blocks without exposing administrative fields.
        cms[slug]?.list("blocks")?.filter { it.optBoolean("enabled", true) }?.forEach { block ->
            val fields = block.optJSONObject("fields")
            val heading = fields?.opt("heading")?.let(::bilingual).orEmpty().ifBlank { fields?.opt("title")?.let(::bilingual).orEmpty() }
            val body = listOf("body", "html", "description", "text", "content").firstNotNullOfOrNull { key ->
                fields?.opt(key)?.let(::bilingual)?.takeIf { it.isNotBlank() }
            }
            if (!body.isNullOrBlank()) item { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (heading.isNotBlank()) Text(plainText(heading), style = MaterialTheme.typography.titleLarge)
                Text(plainText(body), style = MaterialTheme.typography.bodyLarge)
            } }
        }
        item { HorizontalDivider(); Spacer(Modifier.height(14.dp)); Text("Red Solidaria San Ramón", fontWeight = FontWeight.Bold); Text("San Ramón · Chanchamayo · Junín, Perú", style = MaterialTheme.typography.bodySmall) }
    }
}
