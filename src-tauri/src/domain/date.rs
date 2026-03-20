fn is_valid_date(year: u32, month: u32, day: u32) -> bool {
    if month == 0 || month > 12 || day == 0 {
        return false;
    }
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            let leap =
                (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400);
            if leap {
                29
            } else {
                28
            }
        }
        _ => return false,
    };
    day <= days_in_month
}

pub fn extract_dates(content: &str) -> Vec<String> {
    let b = content.as_bytes();
    let len = b.len();
    let mut dates = Vec::new();
    let mut i = 0;
    while i + 10 <= len {
        if b[i..i + 4].iter().all(|c| c.is_ascii_digit())
            && b[i + 4] == b'-'
            && b[i + 5..i + 7].iter().all(|c| c.is_ascii_digit())
            && b[i + 7] == b'-'
            && b[i + 8..i + 10].iter().all(|c| c.is_ascii_digit())
        {
            let before_ok = i == 0 || !b[i - 1].is_ascii_digit();
            let after_ok = i + 10 >= len || !b[i + 10].is_ascii_digit();
            if before_ok && after_ok {
                let year: u32 = content[i..i + 4].parse().unwrap_or(0);
                let month: u32 = content[i + 5..i + 7].parse().unwrap_or(0);
                let day: u32 = content[i + 8..i + 10].parse().unwrap_or(0);
                if is_valid_date(year, month, day) {
                    dates.push(content[i..i + 10].to_string());
                }
            }
        }
        i += 1;
    }
    dates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_valid_dates() {
        let dates = extract_dates("meeting on 2024-03-15 and reminder 2024-12-01");
        assert_eq!(dates, vec!["2024-03-15", "2024-12-01"]);
    }

    #[test]
    fn rejects_invalid_day() {
        let dates = extract_dates("bad date 2024-02-30");
        assert!(dates.is_empty());
    }

    #[test]
    fn rejects_dates_adjacent_to_digits() {
        let dates = extract_dates("12024-03-15x");
        assert!(dates.is_empty());
    }
}
