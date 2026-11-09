package pe.redsolidaria.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CampaignState(
    val campaigns: List<Campaign> = emptyList(),
    val filter: String = "all",
    val loading: Boolean = false,
    val error: String? = null,
    val hasMore: Boolean = false,
    val selectedId: Int? = null,
    val detail: Campaign? = null,
    val detailLoading: Boolean = false,
    val detailError: String? = null,
)

class CampaignViewModel : ViewModel() {
    private val repository = CampaignRepository()
    private val mutableState = MutableStateFlow(CampaignState())
    val state = mutableState.asStateFlow()
    private var listJob: Job? = null
    private var detailJob: Job? = null
    private var nextOffset = 0

    init { load() }

    fun load(filter: String = mutableState.value.filter, append: Boolean = false) {
        if (append && (mutableState.value.loading || !mutableState.value.hasMore)) return
        listJob?.cancel()
        if (!append) nextOffset = 0
        mutableState.value = mutableState.value.copy(
            filter = filter, loading = true, error = null,
            campaigns = if (append) mutableState.value.campaigns else emptyList(),
        )
        listJob = viewModelScope.launch {
            try {
                val rows = repository.page(filter, nextOffset)
                nextOffset += rows.size
                mutableState.value = mutableState.value.copy(
                    campaigns = (mutableState.value.campaigns + rows).distinctBy { it.id },
                    loading = false, hasMore = rows.size == CampaignRepository.PAGE_SIZE,
                )
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                mutableState.value = mutableState.value.copy(loading = false, error = message(error))
            }
        }
    }

    fun open(id: Int) {
        detailJob?.cancel()
        mutableState.value = mutableState.value.copy(
            selectedId = id, detail = null, detailLoading = true, detailError = null,
        )
        detailJob = viewModelScope.launch {
            try {
                val detail = repository.detail(id)
                mutableState.value = mutableState.value.copy(detail = detail, detailLoading = false)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                mutableState.value = mutableState.value.copy(detailLoading = false, detailError = message(error))
            }
        }
    }

    fun closeDetail() {
        detailJob?.cancel()
        mutableState.value = mutableState.value.copy(selectedId = null, detail = null, detailError = null, detailLoading = false)
    }

    private fun message(error: Exception): String = if (error is IOException)
        "${error.message ?: "No hay conexión."} Revisa tu conexión y vuelve a intentar."
        else "No pudimos interpretar los datos del servidor. Intenta nuevamente."
}
