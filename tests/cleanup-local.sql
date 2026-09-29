-- Only the disposable records created by the local verification workflow.
DELETE FROM records WHERE kind = 'task' AND json_extract(data, '$.title') = 'QA · tarefa temporária';
DELETE FROM mail WHERE recipient = 'test@example.com' AND subject IN ('QA draft', 'QA · rascunho temporário');
