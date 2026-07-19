use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, Executor, SqliteConnection};
use std::str::FromStr;
use std::time::Duration;
use tauri::Manager;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlStatement {
    sql: String,
    params: Vec<Value>,
    min_rows_affected: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlStatementResult {
    rows_affected: u64,
    last_insert_id: i64,
}

#[tauri::command]
pub async fn execute_transaction(
    app: tauri::AppHandle,
    statements: Vec<SqlStatement>,
) -> Result<Vec<SqlStatementResult>, String> {
    if statements.is_empty() {
        return Ok(Vec::new());
    }
    let path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("soma.db");
    let url = format!("sqlite:{}", path.to_string_lossy());
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|error| error.to_string())?
        .create_if_missing(false)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| error.to_string())?;
    execute_statements(&mut connection, statements).await
}

async fn execute_statements(
    connection: &mut SqliteConnection,
    statements: Vec<SqlStatement>,
) -> Result<Vec<SqlStatementResult>, String> {
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| error.to_string())?;
    let mut results: Vec<SqlStatementResult> = Vec::with_capacity(statements.len());
    for statement in statements {
        let normalized = statement.sql.trim_start().to_ascii_lowercase();
        if !normalized.starts_with("insert ")
            && !normalized.starts_with("update ")
            && !normalized.starts_with("delete ")
        {
            return Err("transaction statements must be INSERT, UPDATE or DELETE".into());
        }
        let mut query = sqlx::query(&statement.sql);
        for value in statement.params {
            if let Some(reference) = last_insert_reference(&value) {
                let result = results
                    .get(reference)
                    .ok_or_else(|| format!("invalid lastInsertId reference: {reference}"))?;
                query = query.bind(result.last_insert_id);
            } else {
                query = bind_value(query, value)?;
            }
        }
        let result = transaction
            .execute(query)
            .await
            .map_err(|error| error.to_string())?;
        if let Some(minimum) = statement.min_rows_affected {
            if result.rows_affected() < minimum {
                return Err(format!(
                    "transaction conflict: expected at least {minimum} affected row(s)"
                ));
            }
        }
        results.push(SqlStatementResult {
            rows_affected: result.rows_affected(),
            last_insert_id: result.last_insert_rowid(),
        });
    }
    transaction
        .commit()
        .await
        .map_err(|error| error.to_string())?;
    Ok(results)
}

fn last_insert_reference(value: &Value) -> Option<usize> {
    value
        .as_object()?
        .get("$lastInsertId")?
        .as_u64()
        .map(|value| value as usize)
}

fn bind_value<'q>(
    query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: Value,
) -> Result<sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>, String> {
    Ok(match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(value) => query.bind(value),
        Value::Number(value) => {
            if let Some(integer) = value.as_i64() {
                query.bind(integer)
            } else if let Some(float) = value.as_f64() {
                query.bind(float)
            } else {
                return Err("unsupported numeric SQL parameter".into());
            }
        }
        Value::String(value) => query.bind(value),
        value => query.bind(value.to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::{execute_statements, last_insert_reference, SqlStatement};
    use serde_json::json;
    use sqlx::{Connection, SqliteConnection};

    #[test]
    fn resolves_last_insert_reference() {
        assert_eq!(
            last_insert_reference(&json!({ "$lastInsertId": 3 })),
            Some(3)
        );
        assert_eq!(last_insert_reference(&json!("3")), None);
    }

    #[test]
    fn commits_references_and_rolls_back_conflicts() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect(":memory:").await.unwrap();
            sqlx::query("CREATE TABLE parent (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)")
                .execute(&mut connection)
                .await
                .unwrap();
            sqlx::query("CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL)")
                .execute(&mut connection)
                .await
                .unwrap();
            let results = execute_statements(
                &mut connection,
                vec![
                    SqlStatement {
                        sql: "INSERT INTO parent (name) VALUES (?)".into(),
                        params: vec![json!("one")],
                        min_rows_affected: Some(1),
                    },
                    SqlStatement {
                        sql: "INSERT INTO child (id, parent_id) VALUES (?, ?)".into(),
                        params: vec![json!(1), json!({ "$lastInsertId": 0 })],
                        min_rows_affected: Some(1),
                    },
                ],
            )
            .await
            .unwrap();
            assert_eq!(results[0].last_insert_id, 1);
            let parent_id: i64 = sqlx::query_scalar("SELECT parent_id FROM child WHERE id = 1")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            assert_eq!(parent_id, 1);

            let failure = execute_statements(
                &mut connection,
                vec![
                    SqlStatement {
                        sql: "INSERT INTO parent (name) VALUES (?)".into(),
                        params: vec![json!("rolled back")],
                        min_rows_affected: Some(1),
                    },
                    SqlStatement {
                        sql: "UPDATE parent SET name = ? WHERE id = ?".into(),
                        params: vec![json!("missing"), json!(999)],
                        min_rows_affected: Some(1),
                    },
                ],
            )
            .await;
            assert!(failure.is_err());
            let count: i64 = sqlx::query_scalar("SELECT count(*) FROM parent")
                .fetch_one(&mut connection)
                .await
                .unwrap();
            assert_eq!(count, 1);
        });
    }
}
