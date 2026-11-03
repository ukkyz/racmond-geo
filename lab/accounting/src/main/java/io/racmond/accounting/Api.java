package io.racmond.accounting;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;
@RestController
public class Api {
    private final JdbcTemplate jdbc;
    public Api(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @GetMapping("/health") Map<String,Object> health(){jdbc.queryForObject("SELECT 1",Integer.class);return Map.of("ok",true,"service","accounting");}
}
