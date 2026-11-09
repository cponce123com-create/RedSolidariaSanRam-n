package pe.redsolidaria.app

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Rule
import org.junit.Test

class NativeNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val directory = File(InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null), "screenshots")
        directory.mkdirs()
        File(directory, name).outputStream().use { compose.onRoot().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun referenceIdentityAndMainNavigationArePresent() {
        compose.onNodeWithContentDescription("Logo de Red Solidaria").assertExists()
        compose.onNodeWithText("Quiero ayudar").assertExists()
        compose.onNodeWithText("Necesito ayuda").assertExists()
        screenshot("01-inicio.png")
        compose.onNodeWithText("Campañas").performClick()
        compose.onNodeWithText("Campañas solidarias").assertExists()
        screenshot("02-campanas.png")
        compose.onNodeWithText("Noticias").performClick()
        compose.onNodeWithText("Noticias de la red").assertExists()
        screenshot("03-noticias.png")
        compose.onNodeWithText("Adopciones").performClick()
        compose.onNodeWithText("Ellos esperan una familia").assertExists()
        screenshot("04-adopciones.png")
        compose.onNodeWithContentDescription("Abrir menú de secciones").performClick()
        compose.onNodeWithText("Transparencia").performClick()
        compose.onNodeWithText("Transparencia").assertExists()
        screenshot("05-transparencia.png")
    }
}
