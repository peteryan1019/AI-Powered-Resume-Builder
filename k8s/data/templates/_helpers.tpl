{{- define "resumebuilder-data.labels" -}}
app.kubernetes.io/part-of: resumebuilder
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | quote }}
{{- end }}
