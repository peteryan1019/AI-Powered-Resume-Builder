{{- define "resumebuilder-app.labels" -}}
app.kubernetes.io/part-of: resumebuilder
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end }}

{{- define "resumebuilder-app.imagePullSecrets" -}}
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
{{- range . }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{- define "resumebuilder-app.backendImage" -}}
{{ printf "%s:%s" .Values.images.backend.repository .Values.images.backend.tag }}
{{- end }}

{{- define "resumebuilder-app.frontendImage" -}}
{{ printf "%s:%s" .Values.images.frontend.repository .Values.images.frontend.tag }}
{{- end }}
